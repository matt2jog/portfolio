#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio" || "${GITHUB_REF:-}" != "refs/heads/main" || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/release-cleanup.yml@refs/heads/main" || ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ || "${GITHUB_WORKFLOW_SHA:-}" != "${GITHUB_SHA:-}" ]]; then
  echo "Production cleanup is allowed only from the exact Portfolio main cleanup workflow SHA." >&2
  exit 2
fi

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_REGION:?GCP_REGION is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

prior_record="${1:?prior release record is required}"
current_record="${2:?current release record is required}"
cleanup="$(npx tsx src/scripts/release/release-cleanup.ts "$prior_record" "$current_record")"
prior_revision="$(jq -er '.priorRevision' <<<"$cleanup")"
prior_edge_version="$(jq -er '.priorEdgeVersion' <<<"$cleanup")"
current_revision="$(jq -er '.currentRevision' <<<"$cleanup")"
current_edge_version="$(jq -er '.currentEdgeVersion' <<<"$cleanup")"

service="$(gcloud run services describe "$SERVICE_NAME" --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --format=json)"
serving_revision="$(jq -er '[.status.traffic[] | select((.percent // 0) > 0)] | if length == 1 and .[0].percent == 100 then .[0].revisionName else error("traffic is not singular") end' <<<"$service")"
test "$serving_revision" = "$current_revision"
if jq -e --arg prior "$prior_revision" '.status.traffic[] | select(.revisionName == $prior and ((.percent // 0) > 0 or (.tag // "") != ""))' <<<"$service" >/dev/null; then
  tags="$(jq -r --arg prior "$prior_revision" '[.status.traffic[] | select(.revisionName == $prior and (.tag // "") != "") | .tag] | unique | join(",")' <<<"$service")"
  if [[ -n "$tags" ]]; then
    gcloud run services update-traffic "$SERVICE_NAME" --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --remove-tags "$tags" --quiet
  fi
fi
service="$(gcloud run services describe "$SERVICE_NAME" --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --format=json)"
if jq -e --arg prior "$prior_revision" '.status.traffic[] | select(.revisionName == $prior)' <<<"$service" >/dev/null; then
  echo "Old revision remains in Cloud Run traffic/tag state after cleanup detachment." >&2
  exit 1
fi
gcloud run revisions delete "$prior_revision" --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --quiet

edge_status="$(cd infra/cloudflare/portfolio-edge && npx wrangler deployments status --name portfolio-edge --json)"
active_edge_version="$(jq -er '[.versions[] | select((.percentage | tonumber) == 100) | .version_id] | if length == 1 then .[0] else error("active edge version is not singular") end' <<<"$edge_status")"
test "$active_edge_version" = "$current_edge_version"
test "$prior_edge_version" != "$active_edge_version"
curl --fail --silent --show-error \
  --request DELETE \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --output /dev/null \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/portfolio-edge/versions/${prior_edge_version}"

echo "Cleaned retained state for the eligible release after a later successful release."
