#!/usr/bin/env bash
set -euo pipefail

if [[
  "${GITHUB_ACTIONS:-}" != "true"
  || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio"
  || "${GITHUB_REF:-}" != "refs/heads/main"
  || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
  || ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$
  || "${GITHUB_WORKFLOW_SHA:-}" != "${GITHUB_SHA:-}"
  || ! "${APPLICATION_RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$
]]; then
  echo "Portfolio candidate deployment is allowed only from the main GitHub delivery workflow." >&2
  exit 2
fi

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_REGION:?GCP_REGION is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${IMAGE_DIGEST_URI:?IMAGE_DIGEST_URI is required}"
: "${IMAGE_RELEASE_RUN_ID:?IMAGE_RELEASE_RUN_ID is required}"
: "${MIGRATION_EVIDENCE_SHA256:?MIGRATION_EVIDENCE_SHA256 is required}"
: "${RUNTIME_BUNDLE_VERSION:?RUNTIME_BUNDLE_VERSION is required}"
: "${RUNTIME_SECRET_NAME:?RUNTIME_SECRET_NAME is required}"
: "${RUNTIME_SERVICE_ACCOUNT:?RUNTIME_SERVICE_ACCOUNT is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"
: "${EDGE_ORIGIN_TOKEN:?EDGE_ORIGIN_TOKEN is required}"
: "${CANDIDATE_MANIFEST_FILE:?CANDIDATE_MANIFEST_FILE is required}"
: "${CANDIDATE_SMOKE_FILE:?CANDIDATE_SMOKE_FILE is required}"
: "${CLOUD_RUN_ROLLBACK_STATE_FILE:?CLOUD_RUN_ROLLBACK_STATE_FILE is required}"

[[ "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]
[[ "$IMAGE_RELEASE_RUN_ID" =~ ^[1-9][0-9]*$ ]]
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$IMAGE_DIGEST_URI" == "us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@${IMAGE_DIGEST}" ]]
[[ "$MIGRATION_EVIDENCE_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$RUNTIME_BUNDLE_VERSION" =~ ^[1-9][0-9]*$ ]]
test "$GCP_PROJECT_ID" = "personal-brand-501801"
test "$GCP_REGION" = "us-east4"
test "$SERVICE_NAME" = "portfolio--prod"
test "$RUNTIME_SECRET_NAME" = "portfolio-runtime-bundle-prod"
test "$RUNTIME_SERVICE_ACCOUNT" = \
  "portfolio-runtime@personal-brand-501801.iam.gserviceaccount.com"
if [[ ! "$EDGE_ORIGIN_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "EDGE_ORIGIN_TOKEN must be a URL-safe 32-256 character value." >&2
  exit 2
fi
if [[ -n "${EDGE_ORIGIN_PREVIOUS_TOKEN:-}" && ! "$EDGE_ORIGIN_PREVIOUS_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "EDGE_ORIGIN_PREVIOUS_TOKEN must be URL-safe when present." >&2
  exit 2
fi

origin_config="$(mktemp)"
previous_origin_config="$(mktemp)"
outside_us_origin_config="$(mktemp)"
cleanup() {
  rm -f "$origin_config" "$previous_origin_config" "$outside_us_origin_config"
}
trap cleanup EXIT
chmod 600 "$origin_config" "$previous_origin_config" "$outside_us_origin_config"
# Candidate probes emulate the trusted Cloudflare edge contract. The origin token
# authenticates these client metadata headers; the raw-origin probe below proves
# that an unauthenticated caller cannot forge them.
printf 'header = "X-2jog-Origin-Token: %s"\n' "$EDGE_ORIGIN_TOKEN" >"$origin_config"
printf 'header = "X-2jog-Client-IP: 192.0.2.1"\n' >>"$origin_config"
printf 'header = "X-2jog-Client-Country: US"\n' >>"$origin_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' \
  "${EDGE_ORIGIN_PREVIOUS_TOKEN:-$EDGE_ORIGIN_TOKEN}" >"$previous_origin_config"
printf 'header = "X-2jog-Client-IP: 192.0.2.1"\n' >>"$previous_origin_config"
printf 'header = "X-2jog-Client-Country: US"\n' >>"$previous_origin_config"
printf 'header = "X-2jog-Origin-Token: %s"\n' "$EDGE_ORIGIN_TOKEN" >"$outside_us_origin_config"
printf 'header = "X-2jog-Client-IP: 198.51.100.1"\n' >>"$outside_us_origin_config"
printf 'header = "X-2jog-Client-Country: CA"\n' >>"$outside_us_origin_config"

service_json() {
  gcloud run services describe "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --platform managed \
    --format=json
}

iam_policy() {
  gcloud run services get-iam-policy "$SERVICE_NAME" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --platform managed \
    --format=json
}

canonical_iam() {
  jq -cS '
    del(.etag)
    | .bindings = (
        (.bindings // [])
        | map(.members = ((.members // []) | sort))
        | sort_by(.role, (.condition.expression // ""), (.condition.title // ""))
      )
  '
}

revision_json() {
  gcloud run revisions describe "$1" \
    --project "$GCP_PROJECT_ID" \
    --region "$GCP_REGION" \
    --platform managed \
    --format=json
}

initial_service="$(service_json)"
initial_iam="$(iam_policy)"
blue_revision="$(jq -er '
  [.status.traffic[] | select((.percent // 0) > 0)]
  | if length == 1 and .[0].percent == 100
    then .[0].revisionName
    else error("expected one 100-percent production revision")
    end
' <<<"$initial_service")"
blue_image="$(revision_json "$blue_revision" | jq -er '.status.imageDigest')"
[[ "$blue_image" =~ @sha256:[0-9a-f]{64}$ ]]
blue_digest="${blue_image##*@}"

mkdir -p \
  "$(dirname "$CANDIDATE_MANIFEST_FILE")" \
  "$(dirname "$CANDIDATE_SMOKE_FILE")" \
  "$(dirname "$CLOUD_RUN_ROLLBACK_STATE_FILE")"
jq -S -n \
  --arg releaseSha "$APPLICATION_RELEASE_SHA" \
  --arg blueRevision "$blue_revision" \
  --arg blueDigest "$blue_digest" \
  --arg serviceGeneration "$(jq -er '.metadata.generation | tostring' <<<"$initial_service")" \
  --argjson trafficBefore "$(jq -c '.status.traffic' <<<"$initial_service")" \
  --argjson iamBefore "$initial_iam" \
  '{
    schemaVersion: 1,
    releaseSha: $releaseSha,
    blueRevision: $blueRevision,
    blueDigest: $blueDigest,
    serviceGenerationBefore: $serviceGeneration,
    trafficBefore: $trafficBefore,
    iamBefore: $iamBefore
  }' >"$CLOUD_RUN_ROLLBACK_STATE_FILE"
chmod 600 "$CLOUD_RUN_ROLLBACK_STATE_FILE"

revision_suffix="gh-${APPLICATION_RELEASE_SHA:0:8}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
candidate_tag="candidate-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
expected_candidate_revision="${SERVICE_NAME}-${revision_suffix}"
gcloud run deploy "$SERVICE_NAME" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --platform managed \
  --image "$IMAGE_DIGEST_URI" \
  --revision-suffix "$revision_suffix" \
  --labels "service=portfolio,environment=production,release-sha=${APPLICATION_RELEASE_SHA}" \
  --port 8080 \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --min-instances 0 \
  --max-instances 1 \
  --cpu 1 \
  --cpu-throttling \
  --memory 512Mi \
  --concurrency 80 \
  --cpu-boost \
  --no-session-affinity \
  --timeout 300 \
  --set-env-vars "PUBLIC_BASE_URL=https://2jog.dev" \
  --set-secrets "PORTFOLIO_RUNTIME_BUNDLE=${RUNTIME_SECRET_NAME}:${RUNTIME_BUNDLE_VERSION}" \
  --no-traffic \
  --tag "$candidate_tag" \
  --quiet

candidate_url=""
for _attempt in {1..20}; do
  candidate_service="$(service_json)"
  candidate_url="$(jq -r --arg tag "$candidate_tag" '
    [.status.traffic[] | select(.tag == $tag)]
    | if length == 1 then .[0].url // "" else "" end
  ' <<<"$candidate_service")"
  [[ -n "$candidate_url" ]] && break
  sleep 2
done
test -n "$candidate_url"
candidate_iam="$(iam_policy)"
candidate_revision="$(jq -er '.status.latestCreatedRevisionName' <<<"$candidate_service")"
candidate_revision_json="$(revision_json "$candidate_revision")"
candidate_image="$(jq -er '.status.imageDigest' <<<"$candidate_revision_json")"
[[ "$candidate_image" =~ @sha256:[0-9a-f]{64}$ ]]
candidate_digest="${candidate_image##*@}"

test "$candidate_revision" != "$blue_revision"
test "$candidate_revision" = "$expected_candidate_revision"
test "$candidate_digest" = "$IMAGE_DIGEST"
test "$(jq -er '.metadata.labels["release-sha"]' <<<"$candidate_revision_json")" = "$APPLICATION_RELEASE_SHA"
test "$(jq -er '[.status.conditions[] | select(.type == "Ready" and .status == "True")] | length' <<<"$candidate_revision_json")" = "1"
test "$(jq -r '.metadata.annotations["autoscaling.knative.dev/minScale"] // "0"' <<<"$candidate_revision_json")" = "0"
test "$(jq -er '.metadata.annotations["autoscaling.knative.dev/maxScale"]' <<<"$candidate_revision_json")" = "1"
test "$(jq -er --arg revision "$candidate_revision" '
  [.status.traffic[] | select(.revisionName == $revision) | (.percent // 0)] | add // 0
' <<<"$candidate_service")" = "0"
test "$(jq -er '
  [.status.traffic[] | select((.percent // 0) > 0)]
  | if length == 1 and .[0].percent == 100 then .[0].revisionName else "" end
' <<<"$candidate_service")" = "$blue_revision"
test "$(revision_json "$blue_revision" | jq -er '.status.imageDigest')" = "$blue_image"
if [[ "$(canonical_iam <<<"$candidate_iam")" != "$(canonical_iam <<<"$initial_iam")" ]]; then
  echo "Candidate deployment unexpectedly changed Cloud Run IAM." >&2
  exit 1
fi

origin_status="$(curl --config "$origin_config" --silent --show-error \
  --retry 8 --retry-delay 3 --retry-max-time 90 --retry-all-errors \
  --connect-timeout 10 --max-time 30 \
  --output /dev/null --write-out '%{http_code}' "${candidate_url%/}/")"
test "$origin_status" = "200"
previous_origin_status="$origin_status"
if [[ -n "${EDGE_ORIGIN_PREVIOUS_TOKEN:-}" ]]; then
  previous_origin_status="$(curl --config "$previous_origin_config" --silent --show-error \
    --retry 8 --retry-delay 3 --retry-max-time 90 --retry-all-errors \
    --connect-timeout 10 --max-time 30 \
    --output /dev/null --write-out '%{http_code}' "${candidate_url%/}/")"
  test "$previous_origin_status" = "200"
fi
outside_us_origin_status="$(curl --config "$outside_us_origin_config" --silent --show-error \
  --retry 8 --retry-delay 3 --retry-max-time 90 --retry-all-errors \
  --connect-timeout 10 --max-time 30 \
  --output /dev/null --write-out '%{http_code}' "${candidate_url%/}/")"
test "$outside_us_origin_status" = "451"
raw_status="$(curl --silent --show-error \
  --retry 8 --retry-delay 3 --retry-max-time 90 --retry-all-errors \
  --connect-timeout 10 --max-time 30 \
  --output /dev/null --write-out '%{http_code}' "${candidate_url%/}/")"
test "$raw_status" = "401"

smoke_checked_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
jq -S -n \
  --arg checkedAt "$smoke_checked_at" \
  --arg candidateRevision "$candidate_revision" \
  --arg candidateUrl "$candidate_url" \
  --arg imageDigest "$candidate_digest" \
  --arg originStatus "$origin_status" \
  --arg previousOriginStatus "$previous_origin_status" \
  --arg outsideUsOriginStatus "$outside_us_origin_status" \
  --arg rawStatus "$raw_status" \
  '{
    schemaVersion: 1,
    checkedAt: $checkedAt,
    candidateRevision: $candidateRevision,
    candidateUrl: $candidateUrl,
    imageDigest: $imageDigest,
    originAttestedStatus: ($originStatus | tonumber),
    previousOriginAttestedStatus: ($previousOriginStatus | tonumber),
    outsideUsOriginAttestedStatus: ($outsideUsOriginStatus | tonumber),
    rawUnauthenticatedStatus: ($rawStatus | tonumber)
  }' >"$CANDIDATE_SMOKE_FILE"
smoke_sha256="$(sha256sum "$CANDIDATE_SMOKE_FILE" | awk '{print $1}')"

created_at="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
expires_at="$(date -u -d '+6 hours' +'%Y-%m-%dT%H:%M:%S.000Z')"
jq -S -n \
  --arg releaseSha "$APPLICATION_RELEASE_SHA" \
  --arg imageReleaseRunId "$IMAGE_RELEASE_RUN_ID" \
  --arg workflowRunId "$GITHUB_RUN_ID" \
  --arg workflowRunAttempt "$GITHUB_RUN_ATTEMPT" \
  --arg candidateRevision "$candidate_revision" \
  --arg candidateUrl "$candidate_url" \
  --arg imageDigest "$candidate_digest" \
  --arg blueRevision "$blue_revision" \
  --arg blueDigest "$blue_digest" \
  --arg migrationEvidence "$MIGRATION_EVIDENCE_SHA256" \
  --arg smokeCheckedAt "$smoke_checked_at" \
  --arg smokeEvidence "$smoke_sha256" \
  --arg createdAt "$created_at" \
  --arg expiresAt "$expires_at" \
  '{
    manifest: {
      schemaVersion: 1,
      serviceId: "portfolio",
      projectId: "personal-brand-501801",
      region: "us-east4",
      repository: "matt2jog/portfolio",
      workflowRef: "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main",
      releaseSha: $releaseSha,
      imageReleaseRunId: $imageReleaseRunId,
      workflowRunId: $workflowRunId,
      workflowRunAttempt: $workflowRunAttempt,
      components: [{
        id: "web",
        cloudRunService: "portfolio--prod",
        candidateRevision: $candidateRevision,
        candidateUrl: $candidateUrl,
        imageDigest: $imageDigest,
        expectedBlueRevision: $blueRevision,
        expectedBlueDigest: $blueDigest
      }],
      migrations: {
        status: "passed",
        evidenceSha256: $migrationEvidence
      },
      smoke: {
        status: "passed",
        checkedAt: $smokeCheckedAt,
        evidenceSha256: $smokeEvidence
      },
      edge: { changed: false },
      createdAt: $createdAt,
      expiresAt: $expiresAt
    }
  }' >"$CANDIDATE_MANIFEST_FILE"

state_update="$(mktemp)"
jq -S \
  --arg candidateRevision "$candidate_revision" \
  --arg candidateDigest "$candidate_digest" \
  --arg candidateUrl "$candidate_url" \
  --arg manifestFile "$(basename "$CANDIDATE_MANIFEST_FILE")" \
  --argjson trafficAfterCandidate "$(jq -c '.status.traffic' <<<"$candidate_service")" \
  --argjson iamAfterCandidate "$candidate_iam" \
  '.candidateRevision = $candidateRevision
    | .candidateDigest = $candidateDigest
    | .candidateUrl = $candidateUrl
    | .candidateManifestFile = $manifestFile
    | .trafficAfterCandidate = $trafficAfterCandidate
    | .iamAfterCandidate = $iamAfterCandidate' \
  "$CLOUD_RUN_ROLLBACK_STATE_FILE" >"$state_update"
mv "$state_update" "$CLOUD_RUN_ROLLBACK_STATE_FILE"
chmod 600 "$CLOUD_RUN_ROLLBACK_STATE_FILE"

echo "Portfolio candidate ${candidate_revision} is healthy at zero traffic; production remains on ${blue_revision}."
