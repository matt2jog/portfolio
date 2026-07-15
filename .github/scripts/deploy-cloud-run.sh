#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-}" == "production" && ( "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio" || "${GITHUB_REF:-}" != "refs/heads/main" || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main" ) ]]; then
  echo "Production Cloud Run mutation is allowed only from GitHub Actions matt2jog/portfolio refs/heads/main." >&2
  exit 2
fi

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_PROJECT_NUMBER:?GCP_PROJECT_NUMBER is required}"
: "${GCP_REGION:?GCP_REGION is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${IMAGE_DIGEST_URI:?IMAGE_DIGEST_URI is required}"
: "${RUNTIME_BUNDLE_VERSION:?RUNTIME_BUNDLE_VERSION is required}"
: "${RUNTIME_SECRET_NAME:?RUNTIME_SECRET_NAME is required}"
: "${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${EDGE_ORIGIN_TOKEN:?EDGE_ORIGIN_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?CLOUDFLARE_ZONE_ID is required}"

OBSERVATION_SECONDS="${OBSERVATION_SECONDS:-600}"
OBSERVATION_INTERVAL_SECONDS="${OBSERVATION_INTERVAL_SECONDS:-30}"
CUSTOM_URLS=("https://2jog.dev" "https://www.2jog.dev")
EDGE_ROLLBACK_STATE_FILE="${EDGE_ROLLBACK_STATE_FILE:-${RUNNER_TEMP:-/tmp}/portfolio-edge-rollback-state.json}"
export EDGE_ROLLBACK_STATE_FILE
release_id="${GITHUB_SHA:0:10}-${GITHUB_RUN_ATTEMPT:-1}"
candidate_tag="candidate-${GITHUB_SHA:0:10}"

if [[ ! "$EDGE_ORIGIN_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "EDGE_ORIGIN_TOKEN must be a 32-256 character URL-safe token." >&2
  exit 2
fi
if [[ -n "${EDGE_ORIGIN_PREVIOUS_TOKEN:-}" && ! "$EDGE_ORIGIN_PREVIOUS_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "EDGE_ORIGIN_PREVIOUS_TOKEN must be a 32-256 character URL-safe token when provided." >&2
  exit 2
fi
previous_edge_origin_token="${EDGE_ORIGIN_PREVIOUS_TOKEN:-$EDGE_ORIGIN_TOKEN}"
has_previous_edge_origin_token=false
if [[ -n "${EDGE_ORIGIN_PREVIOUS_TOKEN:-}" ]]; then
  has_previous_edge_origin_token=true
fi

origin_curl_config="$(mktemp)"
previous_origin_curl_config="$(mktemp)"
cleanup() { rm -f "$origin_curl_config" "$previous_origin_curl_config"; }
trap cleanup EXIT
chmod 600 "$origin_curl_config" "$previous_origin_curl_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$EDGE_ORIGIN_TOKEN" >"$origin_curl_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$previous_edge_origin_token" >"$previous_origin_curl_config"

service_json() {
  gcloud run services describe "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --format=json
}

smoke_url() {
  local url="$1"
  curl --fail --silent --show-error \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    --output /dev/null "${url%/}/"
}

smoke_origin_url() {
  local url="$1"
  curl --config "$origin_curl_config" --fail --silent --show-error \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    --output /dev/null "${url%/}/"
}

smoke_previous_origin_url() {
  local url="$1"
  curl --config "$previous_origin_curl_config" --fail --silent --show-error \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    --output /dev/null "${url%/}/"
}

smoke_raw_denial() {
  local url="$1" status attempt
  for attempt in 1 2 3 4 5; do
    status="$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
      --output /dev/null --write-out '%{http_code}' "${url%/}/")" || status="000"
    if [[ "$status" == "401" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Raw origin did not deny an unauthenticated request after ${attempt} attempts." >&2
  return 1
}

smoke_candidate_tag() {
  smoke_origin_url "$candidate_url" || return 1
  if [[ "$has_previous_edge_origin_token" == true ]]; then
    smoke_previous_origin_url "$candidate_url" || return 1
  fi
  smoke_raw_denial "$candidate_url" || return 1
}

smoke_candidate() {
  smoke_candidate_tag || return 1
  local url
  for url in "${raw_service_urls[@]}"; do
    smoke_origin_url "$url" || return 1
    smoke_raw_denial "$url" || return 1
  done
}

smoke_custom_domains() {
  local url
  for url in "${CUSTOM_URLS[@]}"; do
    smoke_url "$url" || return 1
  done
}

rollback_if_causal() {
  local current_revision rollback_url candidate_imageDigest
  current_revision="$(service_json | jq -r '.status.traffic[] | select(.percent == 100) | .revisionName' | head -n1)"
  rollback_url="$(service_json | jq -r '.status.traffic[] | select(.tag == "rollback") | .url' | head -n1)"
  candidate_imageDigest="$(gcloud run revisions describe "$candidate_revision" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --format='value(status.imageDigest)')"

  if [[ "$current_revision" != "$candidate_revision" || "$candidate_imageDigest" != "$IMAGE_DIGEST" ]]; then
    echo "Release no longer owns production traffic; refusing automatic rollback."
    return 1
  fi
  if [[ -z "$previous_revision" || -z "$rollback_url" ]] || ! smoke_previous_origin_url "$rollback_url"; then
    echo "Previous revision is not independently healthy; failure is not proven release-caused."
    return 1
  fi

  gcloud run services update-traffic "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --to-revisions "${previous_revision}=100" \
    --quiet
  smoke_custom_domains
  echo "Rolled back release ${GITHUB_SHA} to ${previous_revision}."
}

restore_previous_edge() {
  if [[ ! -s "$EDGE_ROLLBACK_STATE_FILE" ]]; then
    echo "No Portfolio edge release state exists; the prior Worker is still active."
    return 0
  fi
  bash .github/scripts/deploy-portfolio-edge.sh rollback
}

rollback_coordinated_release() {
  local current_revision
  current_revision="$(service_json | jq -r '.status.traffic[] | select(.percent == 100) | .revisionName' | head -n1)"
  if [[ "$current_revision" == "$previous_revision" ]]; then
    echo "Production origin still runs the previous revision; restoring the prior Portfolio edge only."
    if ! restore_previous_edge || ! smoke_custom_domains; then
      echo "Portfolio edge rollback failed; manual intervention is required." >&2
      return 1
    fi
  elif [[ "$current_revision" == "$candidate_revision" ]]; then
    if ! restore_previous_edge; then
      echo "Portfolio edge rollback failed; retaining the compatible candidate origin." >&2
      return 1
    fi
    if ! rollback_if_causal; then
      echo "Cloud Run rollback was not safe after restoring the prior Portfolio edge." >&2
      return 1
    fi
  else
    echo "An unrelated revision owns production traffic; refusing coordinated rollback." >&2
    return 1
  fi
}

initial_service_json="$(service_json)"
previous_revision="$(jq -r '.status.traffic[] | select(.percent == 100) | .revisionName' <<<"$initial_service_json" | head -n1)"
raw_service_url="$(jq -r '.status.url' <<<"$initial_service_json")"
regional_raw_service_url="https://${SERVICE_NAME}-${GCP_PROJECT_NUMBER}.${GCP_REGION}.run.app"
raw_service_urls=("$raw_service_url")
if [[ "$regional_raw_service_url" != "$raw_service_url" ]]; then
  raw_service_urls+=("$regional_raw_service_url")
fi
test -n "$previous_revision"
test -n "$raw_service_url"

for url in "${raw_service_urls[@]}"; do
  smoke_previous_origin_url "$url"
done
for url in "${CUSTOM_URLS[@]}"; do
  smoke_url "$url"
done

gcloud run services update-traffic "$SERVICE_NAME" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --update-tags "rollback=${previous_revision}" \
  --quiet

gcloud run deploy "$SERVICE_NAME" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --platform managed \
  --image "$IMAGE_DIGEST_URI" \
  --revision-suffix "$release_id" \
  --port 8080 \
  --allow-unauthenticated \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --min-instances 0 \
  --max-instances 1 \
  --cpu 1 \
  --cpu-throttling \
  --memory 512Mi \
  --concurrency 80 \
  --cpu-boost \
  --set-env-vars "PUBLIC_BASE_URL=https://2jog.dev" \
  --set-secrets "PORTFOLIO_RUNTIME_BUNDLE=${RUNTIME_SECRET_NAME}:${RUNTIME_BUNDLE_VERSION}" \
  --no-traffic \
  --tag="${candidate_tag}" \
  --quiet

gcloud beta run services update "$SERVICE_NAME" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --min=0 \
  --max=1 \
  --quiet

candidate_service_json="$(service_json)"
candidate_revision="$(jq -r '.status.latestCreatedRevisionName' <<<"$candidate_service_json")"
candidate_url="$(jq -r --arg tag "$candidate_tag" '.status.traffic[] | select(.tag == $tag) | .url' <<<"$candidate_service_json" | head -n1)"
candidate_imageDigest="$(gcloud run revisions describe "$candidate_revision" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(status.imageDigest)')"
test -n "$candidate_revision"
test -n "$candidate_url"
test "$candidate_imageDigest" = "$IMAGE_DIGEST"

smoke_candidate_tag
for url in "${CUSTOM_URLS[@]}"; do
  smoke_url "$url"
done

if ! (
  set -e
  gcloud run services update-traffic "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --to-revisions "${candidate_revision}=100" \
    --update-tags "stable=${candidate_revision},rollback=${previous_revision}" \
    --quiet

  smoke_candidate
  smoke_custom_domains

  bash .github/scripts/deploy-portfolio-edge.sh deploy
  smoke_custom_domains

  observed=0
  while (( observed < OBSERVATION_SECONDS )); do
    sleep "$OBSERVATION_INTERVAL_SECONDS"
    observed=$((observed + OBSERVATION_INTERVAL_SECONDS))
    smoke_candidate
    smoke_custom_domains
    echo "Observed healthy release for ${observed}/${OBSERVATION_SECONDS} seconds."
  done
); then
  if ! rollback_coordinated_release; then
    echo "Release failed and automatic recovery was incomplete; manual intervention is required." >&2
  fi
  exit 1
fi

echo "Release ${GITHUB_SHA} is healthy on ${candidate_revision} after ${OBSERVATION_SECONDS} seconds."
