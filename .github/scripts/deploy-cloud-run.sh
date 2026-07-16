#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio" || "${GITHUB_REF:-}" != "refs/heads/main" || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main" || ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ || "${GITHUB_WORKFLOW_SHA:-}" != "${GITHUB_SHA:-}" ]]; then
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
: "${PORTFOLIO_AUTHORITY_PHASE:?PORTFOLIO_AUTHORITY_PHASE is required}"
: "${PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY:?PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY is required}"
: "${PORTFOLIO_MIGRATION_LEDGER_DIGEST:?PORTFOLIO_MIGRATION_LEDGER_DIGEST is required}"
: "${PORTFOLIO_CUTOVER_EVIDENCE_SHA256:?PORTFOLIO_CUTOVER_EVIDENCE_SHA256 is required}"
: "${PORTFOLIO_PUBSUB_CONFIGURATION_GENERATION:?PORTFOLIO_PUBSUB_CONFIGURATION_GENERATION is required}"
: "${DEPLOYMENT_BUNDLE_VERSION:?DEPLOYMENT_BUNDLE_VERSION is required}"
: "${LEGAL_AUDIT_BUNDLE_VERSION:?LEGAL_AUDIT_BUNDLE_VERSION is required}"
: "${RELEASE_RECORD_FILE:?RELEASE_RECORD_FILE is required}"
: "${PORTFOLIO_SOURCE_FENCE_TOKEN:?PORTFOLIO_SOURCE_FENCE_TOKEN is required}"

if [[ ! "$PORTFOLIO_SOURCE_FENCE_TOKEN" =~ ^[0-9a-f]{64}$ ]]; then
  echo "PORTFOLIO_SOURCE_FENCE_TOKEN must be an exact 64-character token." >&2
  exit 2
fi

origin_curl_config=""
previous_origin_curl_config=""
authority_state_file="$(mktemp)"
printf 'pending\n' >"$authority_state_file"
abort_source_fence() {
  if [[ "$(cat "$authority_state_file")" != "pending" ]]; then
    return 0
  fi
  npx tsx src/scripts/release/source-write-fence-command.ts abort "$PORTFOLIO_SOURCE_FENCE_TOKEN"
  printf 'aborted\n' >"$authority_state_file"
}
cleanup() {
  local status=$?
  if [[ "$status" != 0 && "$(cat "$authority_state_file" 2>/dev/null || true)" == "pending" ]]; then
    abort_source_fence || echo "Automatic source-fence abort failed; its bounded lease remains the fail-safe." >&2
  fi
  rm -f "$origin_curl_config" "$previous_origin_curl_config" "$authority_state_file"
  return "$status"
}
trap cleanup EXIT

if [[ "$PORTFOLIO_AUTHORITY_PHASE" != "private-irreversible" ]]; then
  echo "Portfolio releases require the private-irreversible data-authority phase." >&2
  exit 2
fi
if [[ ! "$PORTFOLIO_MIGRATION_LEDGER_DIGEST" =~ ^[0-9a-f]{64}$ || ! "$PORTFOLIO_CUTOVER_EVIDENCE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Migration-ledger and cutover-evidence digests must be exact SHA-256 values." >&2
  exit 2
fi

OBSERVATION_SECONDS="${OBSERVATION_SECONDS:-600}"
OBSERVATION_INTERVAL_SECONDS="${OBSERVATION_INTERVAL_SECONDS:-30}"
CUSTOM_URLS=("https://2jog.dev" "https://www.2jog.dev")
EDGE_ROLLBACK_STATE_FILE="${EDGE_ROLLBACK_STATE_FILE:-${RUNNER_TEMP:-/tmp}/portfolio-edge-rollback-state.json}"
CLOUD_RUN_ROLLBACK_STATE_FILE="${CLOUD_RUN_ROLLBACK_STATE_FILE:-${RUNNER_TEMP:-/tmp}/portfolio-cloud-run-rollback-state.json}"
export EDGE_ROLLBACK_STATE_FILE CLOUD_RUN_ROLLBACK_STATE_FILE
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
chmod 600 "$origin_curl_config" "$previous_origin_curl_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$EDGE_ORIGIN_TOKEN" >"$origin_curl_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$previous_edge_origin_token" >"$previous_origin_curl_config"

service_json() {
  gcloud run services describe "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --format=json
}

iam_policy() {
  gcloud run services get-iam-policy "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --format=json
}

canonical_iam() {
  jq -cS 'del(.etag) | .bindings = ((.bindings // []) | map(.members = ((.members // []) | sort)) | sort_by(.role, (.condition.expression // ""), (.condition.title // "")))'
}

canonical_traffic() {
  jq -cS 'map({revisionName, percent: (.percent // 0), tag: (.tag // "")}) | sort_by(.revisionName, .tag, .percent)'
}

restore_cloud_run_state() {
  test -s "$CLOUD_RUN_ROLLBACK_STATE_FILE"
  local current_service current_iam expected_candidate_iam before_iam traffic_targets tag_targets restored_service restore_policy current_etag
  current_service="$(service_json)"
  current_iam="$(iam_policy)"
  expected_candidate_iam="$(jq -cS '.iam_after_candidate | del(.etag) | .bindings = ((.bindings // []) | map(.members = ((.members // []) | sort)) | sort_by(.role, (.condition.expression // ""), (.condition.title // "")))' "$CLOUD_RUN_ROLLBACK_STATE_FILE")"
  if [[ "$(canonical_iam <<<"$current_iam")" != "$expected_candidate_iam" ]]; then
    echo "Cloud Run IAM changed after this release; refusing to overwrite concurrent policy state." >&2
    return 1
  fi

  traffic_targets="$(jq -er '[.traffic_before[] | select((.percent // 0) > 0) | "\(.revisionName)=\(.percent)"] | unique | if length == 0 then error("rollback traffic is empty") else join(",") end' "$CLOUD_RUN_ROLLBACK_STATE_FILE")"
  tag_targets="$(jq -r '[.traffic_before[] | select((.tag // "") != "") | "\(.tag)=\(.revisionName)"] | unique | join(",")' "$CLOUD_RUN_ROLLBACK_STATE_FILE")"
  gcloud run services update-traffic "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --clear-tags \
    --to-revisions "$traffic_targets" \
    --quiet
  if [[ -n "$tag_targets" ]]; then
    gcloud run services update-traffic "$SERVICE_NAME" \
      --project "$GCP_PROJECT_ID" \
      --region "$GCP_REGION" \
      --set-tags "$tag_targets" \
      --quiet
  fi

  before_iam="$(jq -c '.iam_before' "$CLOUD_RUN_ROLLBACK_STATE_FILE")"
  if [[ "$(canonical_iam <<<"$current_iam")" != "$(canonical_iam <<<"$before_iam")" ]]; then
    current_etag="$(jq -er '.etag' <<<"$(iam_policy)")"
    restore_policy="$(mktemp)"
    jq --arg etag "$current_etag" '.etag = $etag' <<<"$before_iam" >"$restore_policy"
    gcloud run services set-iam-policy "$SERVICE_NAME" "$restore_policy" \
      --project "$GCP_PROJECT_ID" \
      --region "$GCP_REGION" \
      --quiet
    rm -f "$restore_policy"
  fi

  restored_service="$(service_json)"
  if [[ "$(jq -c '.status.traffic' <<<"$restored_service" | canonical_traffic)" != "$(jq -c '.traffic_before' "$CLOUD_RUN_ROLLBACK_STATE_FILE" | canonical_traffic)" ]]; then
    echo "Cloud Run traffic/tag restoration did not reproduce the exact prior state." >&2
    return 1
  fi
  if [[ "$(iam_policy | canonical_iam)" != "$(jq -c '.iam_before' "$CLOUD_RUN_ROLLBACK_STATE_FILE" | canonical_iam)" ]]; then
    echo "Cloud Run IAM restoration did not reproduce the exact prior state." >&2
    return 1
  fi
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
  local current_revision rollback_url candidate_imageDigest previous_image_digest
  if [[ "$PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY" == "public-only" ]]; then
    if [[ "$(cat "$authority_state_file")" != "aborted" ]]; then
      echo "Automatic rollback is disabled: the public writer is viable only after an exact pre-authority fence abort." >&2
      return 1
    fi
  else
    if [[ "$PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY" != "private-compatible" || ! "${PORTFOLIO_PRIVATE_COMPATIBLE_PREVIOUS_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      echo "Automatic rollback is disabled: no exact private-compatible previous digest is bound." >&2
      return 1
    fi
  fi
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
  if [[ "$PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY" == "private-compatible" ]]; then
    previous_image_digest="$(gcloud run revisions describe "$previous_revision" \
      --project "$GCP_PROJECT_ID" \
      --region "$GCP_REGION" \
      --format='value(status.imageDigest)')"
    if [[ "$previous_image_digest" != "$PORTFOLIO_PRIVATE_COMPATIBLE_PREVIOUS_DIGEST" ]]; then
      echo "Automatic rollback is disabled: previous revision digest is not the reviewed private-compatible digest." >&2
      return 1
    fi
  fi
  if [[ -z "$previous_revision" || -z "$rollback_url" ]] || ! smoke_previous_origin_url "$rollback_url"; then
    echo "Previous revision is not independently healthy; failure is not proven release-caused."
    return 1
  fi

  restore_cloud_run_state
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
initial_iam_json="$(iam_policy)"
previous_revision="$(jq -r '.status.traffic[] | select(.percent == 100) | .revisionName' <<<"$initial_service_json" | head -n1)"
raw_service_url="$(jq -r '.status.url' <<<"$initial_service_json")"
regional_raw_service_url="https://${SERVICE_NAME}-${GCP_PROJECT_NUMBER}.${GCP_REGION}.run.app"
raw_service_urls=("$raw_service_url")
if [[ "$regional_raw_service_url" != "$raw_service_url" ]]; then
  raw_service_urls+=("$regional_raw_service_url")
fi
test -n "$previous_revision"
test -n "$raw_service_url"

current_origin_token_sha256="$(printf '%s' "$EDGE_ORIGIN_TOKEN" | sha256sum | awk '{print $1}')"
previous_origin_token_sha256=""
if [[ -n "${EDGE_ORIGIN_PREVIOUS_TOKEN:-}" ]]; then
  previous_origin_token_sha256="$(printf '%s' "$EDGE_ORIGIN_PREVIOUS_TOKEN" | sha256sum | awk '{print $1}')"
fi
jq -n \
  --arg release_sha "$GITHUB_SHA" \
  --arg service_generation_before "$(jq -er '.metadata.generation | tostring' <<<"$initial_service_json")" \
  --arg current_origin_token_sha256 "$current_origin_token_sha256" \
  --arg previous_origin_token_sha256 "$previous_origin_token_sha256" \
  --argjson traffic_before "$(jq -c '.status.traffic' <<<"$initial_service_json")" \
  --argjson iam_before "$initial_iam_json" \
  '{
    schema_version: 1,
    release_sha: $release_sha,
    service_generation_before: $service_generation_before,
    traffic_before: $traffic_before,
    iam_before: $iam_before,
    iam_after_candidate: null,
    traffic_after_candidate: null,
    current_origin_token_sha256: $current_origin_token_sha256,
    previous_origin_token_sha256: (if $previous_origin_token_sha256 == "" then null else $previous_origin_token_sha256 end)
  }' >"$CLOUD_RUN_ROLLBACK_STATE_FILE"
chmod 600 "$CLOUD_RUN_ROLLBACK_STATE_FILE"

previous_image_digest="$(gcloud run revisions describe "$previous_revision" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(status.imageDigest)')"
case "$PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY" in
  public-only)
    [[ "${PORTFOLIO_PUBLIC_ONLY_BASELINE_IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]]
    test "$previous_image_digest" = "$PORTFOLIO_PUBLIC_ONLY_BASELINE_IMAGE_DIGEST"
    ;;
  private-compatible)
    [[ "${PORTFOLIO_PRIVATE_COMPATIBLE_PREVIOUS_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]]
    test "$previous_image_digest" = "$PORTFOLIO_PRIVATE_COMPATIBLE_PREVIOUS_DIGEST"
    ;;
  *)
    echo "Previous revision compatibility must be public-only or private-compatible." >&2
    exit 2
    ;;
esac

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
candidate_iam_json="$(iam_policy)"
candidate_revision="$(jq -r '.status.latestCreatedRevisionName' <<<"$candidate_service_json")"
candidate_url="$(jq -r --arg tag "$candidate_tag" '.status.traffic[] | select(.tag == $tag) | .url' <<<"$candidate_service_json" | head -n1)"
candidate_imageDigest="$(gcloud run revisions describe "$candidate_revision" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --format='value(status.imageDigest)')"
test -n "$candidate_revision"
test -n "$candidate_url"
test "$candidate_imageDigest" = "$IMAGE_DIGEST"
if [[ "$(canonical_iam <<<"$candidate_iam_json")" != "$(canonical_iam <<<"$initial_iam_json")" ]]; then
  echo "Candidate deployment unexpectedly changed Cloud Run IAM." >&2
  exit 1
fi
state_update="$(mktemp)"
jq \
  --arg candidate_revision "$candidate_revision" \
  --argjson iam_after_candidate "$candidate_iam_json" \
  --argjson traffic_after_candidate "$(jq -c '.status.traffic' <<<"$candidate_service_json")" \
  '.candidate_revision = $candidate_revision | .iam_after_candidate = $iam_after_candidate | .traffic_after_candidate = $traffic_after_candidate' \
  "$CLOUD_RUN_ROLLBACK_STATE_FILE" >"$state_update"
mv "$state_update" "$CLOUD_RUN_ROLLBACK_STATE_FILE"
chmod 600 "$CLOUD_RUN_ROLLBACK_STATE_FILE"

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

  npx tsx src/scripts/release/source-write-fence-command.ts commit "$PORTFOLIO_SOURCE_FENCE_TOKEN"
  printf 'committed\n' >"$authority_state_file"

  observed=0
  while (( observed < OBSERVATION_SECONDS )); do
    sleep "$OBSERVATION_INTERVAL_SECONDS"
    observed=$((observed + OBSERVATION_INTERVAL_SECONDS))
    smoke_candidate
    smoke_custom_domains
    echo "Observed healthy release for ${observed}/${OBSERVATION_SECONDS} seconds."
  done
); then
  if [[ "$(cat "$authority_state_file")" == "pending" ]]; then
    abort_source_fence
  fi
  if ! rollback_coordinated_release; then
    echo "Release failed and automatic recovery was incomplete; manual intervention is required." >&2
  fi
  exit 1
fi

traffic_generation="$(service_json | jq -er '.metadata.generation | tostring')"
final_service_json="$(service_json)"
state_update="$(mktemp)"
jq --arg service_generation_after "$traffic_generation" \
  --argjson traffic_after "$(jq -c '.status.traffic' <<<"$final_service_json")" \
  '.service_generation_after = $service_generation_after | .traffic_after = $traffic_after' \
  "$CLOUD_RUN_ROLLBACK_STATE_FILE" >"$state_update"
mv "$state_update" "$CLOUD_RUN_ROLLBACK_STATE_FILE"
chmod 600 "$CLOUD_RUN_ROLLBACK_STATE_FILE"
edge_version="$(jq -er '.candidate_version' "$EDGE_ROLLBACK_STATE_FILE")"
export PORTFOLIO_PREVIOUS_REVISION="$previous_revision"
export PORTFOLIO_CANDIDATE_REVISION="$candidate_revision"
export PORTFOLIO_TRAFFIC_GENERATION="$traffic_generation"
export PORTFOLIO_EDGE_VERSION="$edge_version"
npx tsx src/scripts/release/release-record.ts "$RELEASE_RECORD_FILE" >/dev/null

echo "Release ${GITHUB_SHA} is healthy on ${candidate_revision} after ${OBSERVATION_SECONDS} seconds."
