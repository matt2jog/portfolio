#!/usr/bin/env bash
set -euo pipefail

if [[
  "${GITHUB_ACTIONS:-}" != "true"
  || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio"
  || "${GITHUB_REF:-}" != "refs/heads/main"
  || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
]]; then
  echo "Portfolio candidate publication is allowed only from the main delivery workflow." >&2
  exit 2
fi

: "${CANDIDATE_MANIFEST_FILE:?CANDIDATE_MANIFEST_FILE is required}"
: "${CONTROLLER_ID_TOKEN:?CONTROLLER_ID_TOKEN is required}"
: "${CONTROLLER_RESPONSE_FILE:?CONTROLLER_RESPONSE_FILE is required}"
: "${DEPLOY_SERVICE_ACCOUNT:?DEPLOY_SERVICE_ACCOUNT is required}"
: "${EXPECTED_CANDIDATE_SHA:?EXPECTED_CANDIDATE_SHA is required}"
: "${RELEASE_CONTROLLER_URL:?RELEASE_CONTROLLER_URL is required}"

[[ "$EXPECTED_CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]]
test "$DEPLOY_SERVICE_ACCOUNT" = \
  "portfolio-deploy@personal-brand-501801.iam.gserviceaccount.com"
test "$RELEASE_CONTROLLER_URL" = \
  "https://release-controller-hqojlnvxwa-uk.a.run.app"
test -s "$CANDIDATE_MANIFEST_FILE"

jq -e --arg releaseSha "$EXPECTED_CANDIDATE_SHA" '
  .manifest.schemaVersion == 1
  and .manifest.serviceId == "portfolio"
  and .manifest.projectId == "personal-brand-501801"
  and .manifest.region == "us-east4"
  and .manifest.repository == "matt2jog/portfolio"
  and .manifest.workflowRef
    == "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
  and .manifest.releaseSha == $releaseSha
' "$CANDIDATE_MANIFEST_FILE" >/dev/null

status="$(curl --silent --show-error \
  --connect-timeout 10 --max-time 60 \
  --output "$CONTROLLER_RESPONSE_FILE" --write-out '%{http_code}' \
  --request POST "${RELEASE_CONTROLLER_URL}/v1/candidates" \
  --header "Authorization: Bearer ${CONTROLLER_ID_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary "@${CANDIDATE_MANIFEST_FILE}")"
unset CONTROLLER_ID_TOKEN

case "$status" in
  200|201) ;;
  *)
    jq -c '{error: .error // "candidate_publish_failed"}' \
      "$CONTROLLER_RESPONSE_FILE" >&2 || true
    exit 1
    ;;
esac

jq -e --arg publisher "$DEPLOY_SERVICE_ACCOUNT" '
  .candidate.publisherEmail == $publisher
  and (.candidate.manifestId | test(
    "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
  ))
  and (.candidate.manifestSha256 | test("^[0-9a-f]{64}$"))
' "$CONTROLLER_RESPONSE_FILE" >/dev/null
diff \
  <(jq -cS '.manifest' "$CANDIDATE_MANIFEST_FILE") \
  <(jq -cS '.candidate.manifest' "$CONTROLLER_RESPONSE_FILE")

echo "Portfolio candidate publication was accepted by the release controller."
