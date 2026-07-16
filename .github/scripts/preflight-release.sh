#!/usr/bin/env bash
set -euo pipefail

EXPECTED_WORKFLOW_REF="matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
if [[ "${NODE_ENV:-}" != "production" \
  || "${GITHUB_ACTIONS:-}" != "true" \
  || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio" \
  || "${GITHUB_REF:-}" != "refs/heads/main" \
  || "${GITHUB_WORKFLOW_REF:-}" != "$EXPECTED_WORKFLOW_REF" \
  || ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ \
  || "${GITHUB_WORKFLOW_SHA:-}" != "${GITHUB_SHA:-}" ]]; then
  echo "Production preflight is allowed only from the exact Portfolio deploy workflow on main." >&2
  exit 2
fi

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_PROJECT_NUMBER:?GCP_PROJECT_NUMBER is required}"
: "${GCP_REGION:?GCP_REGION is required}"
: "${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${EDGE_ORIGIN_TOKEN:?EDGE_ORIGIN_TOKEN is required}"

previous_token="${EDGE_ORIGIN_PREVIOUS_TOKEN:-$EDGE_ORIGIN_TOKEN}"
if [[ ! "$previous_token" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "The current-origin compatibility token is invalid." >&2
  exit 2
fi

gcloud artifacts repositories describe portfolio \
  --project "$GCP_PROJECT_ID" --location "$GCP_REGION" --format='value(name)' >/dev/null
gcloud iam service-accounts describe "$RUNTIME_SERVICE_ACCOUNT" \
  --project "$GCP_PROJECT_ID" --format='value(email)' >/dev/null

service_json="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --format=json)"
current_revision="$(jq -er '.status.traffic[] | select(.percent == 100) | .revisionName' <<<"$service_json" | head -n1)"
canonical_raw_url="$(jq -er '.status.url' <<<"$service_json")"
regional_raw_url="https://${SERVICE_NAME}-${GCP_PROJECT_NUMBER}.${GCP_REGION}.run.app"
test -n "$current_revision"

curl_config="$(mktemp)"
cleanup() { rm -f "$curl_config"; }
trap cleanup EXIT
chmod 600 "$curl_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$previous_token" >"$curl_config"

for url in "$canonical_raw_url" "$regional_raw_url"; do
  curl --config "$curl_config" --fail --silent --show-error \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 --output /dev/null "${url%/}/"
done
for url in https://2jog.dev https://www.2jog.dev; do
  curl --fail --silent --show-error --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 10 --max-time 30 --output /dev/null "${url%/}/"
done

bash .github/scripts/deploy-portfolio-edge.sh preflight
echo "Portfolio production dependencies are readable and the current edge/origin path is compatible."
