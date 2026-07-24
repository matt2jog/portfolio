#!/usr/bin/env bash
set -euo pipefail

if [[
  "${GITHUB_ACTIONS:-}" != "true"
  || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio"
  || "${GITHUB_REF:-}" != "refs/heads/main"
  || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
]]; then
  echo "Portfolio candidate recovery is allowed only from the main delivery workflow." >&2
  exit 2
fi

source_run_id="${1:-}"
destination="${2:-}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
[[ "$source_run_id" =~ ^[1-9][0-9]*$ ]]
test -n "$destination"

run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${source_run_id}")"
head_sha="$(jq -er '
  select(
    .path == ".github/workflows/deploy.yml"
    and .event == "workflow_dispatch"
    and .head_branch == "main"
    and .status == "completed"
    and .conclusion == "failure"
  )
  | .head_sha
' <<<"$run_json")"
run_attempt="$(jq -er '.run_attempt | tostring' <<<"$run_json")"
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$run_attempt" =~ ^[1-9][0-9]*$ ]]

jobs_json="$(gh api \
  "repos/${GITHUB_REPOSITORY}/actions/runs/${source_run_id}/jobs?filter=all&per_page=100")"
jq -e '
  [.jobs[] | select(.name == "candidate")] as $candidateJobs
  | ($candidateJobs | length) == 1
  and $candidateJobs[0].conclusion == "failure"
  and ([
    $candidateJobs[0].steps[]
    | select(.name == "Consume the one approved immutable image handoff")
    | .conclusion
  ] == ["success"])
  and ([
    $candidateJobs[0].steps[]
    | select(.name == "Run additive migrations using the approved image")
    | .conclusion
  ] == ["success"])
  and ([
    $candidateJobs[0].steps[]
    | select(.name == "Deploy and smoke-test green at zero traffic")
    | .conclusion
  ] == ["success"])
  and ([
    $candidateJobs[0].steps[]
    | select(.name == "Publish identity-attested candidate to release controller")
    | .conclusion
  ] == ["failure"])
  and ([
    $candidateJobs[0].steps[]
    | select(.name == "Retain candidate handoff evidence")
    | .conclusion
  ] == ["success"])
' <<<"$jobs_json" >/dev/null

artifact_name="portfolio-candidate-${head_sha}-${source_run_id}-${run_attempt}"
artifacts_json="$(gh api \
  "repos/${GITHUB_REPOSITORY}/actions/runs/${source_run_id}/artifacts?per_page=100")"
jq -e --arg artifactName "$artifact_name" '
  [.artifacts[] | select(.expired == false and .name == $artifactName)]
  | length == 1
' <<<"$artifacts_json" >/dev/null

mkdir -p "$destination"
test -z "$(find "$destination" -mindepth 1 -maxdepth 1 -print -quit)"
gh run download "$source_run_id" --name "$artifact_name" --dir "$destination"

expected_files="$(
  printf '%s\n' \
    portfolio-candidate-manifest.json \
    portfolio-candidate-smoke.json \
    portfolio-cloud-run-rollback-state.json \
    portfolio-migration-evidence.json \
    portfolio-release-image.json \
  | sort
)"
actual_files="$(find "$destination" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | sort)"
test "$actual_files" = "$expected_files"

manifest_file="${destination}/portfolio-candidate-manifest.json"
smoke_file="${destination}/portfolio-candidate-smoke.json"
migration_file="${destination}/portfolio-migration-evidence.json"
image_file="${destination}/portfolio-release-image.json"
rollback_file="${destination}/portfolio-cloud-run-rollback-state.json"
smoke_sha256="$(sha256sum "$smoke_file" | awk '{print $1}')"
migration_sha256="$(sha256sum "$migration_file" | awk '{print $1}')"
image_release_run_id="$(jq -er '.workflowRunId' "$image_file")"
release_sha="$(jq -er '
  .manifest.releaseSha
  | select(test("^[0-9a-f]{40}$"))
' "$manifest_file")"

jq -e \
  --arg releaseSha "$release_sha" \
  --arg workflowRunId "$source_run_id" \
  --arg workflowRunAttempt "$run_attempt" \
  --arg imageReleaseRunId "$image_release_run_id" \
  --arg smokeSha256 "$smoke_sha256" \
  --arg migrationSha256 "$migration_sha256" '
    .manifest.schemaVersion == 1
    and .manifest.serviceId == "portfolio"
    and .manifest.projectId == "personal-brand-501801"
    and .manifest.region == "us-east4"
    and .manifest.repository == "matt2jog/portfolio"
    and .manifest.workflowRef
      == "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main"
    and .manifest.releaseSha == $releaseSha
    and .manifest.workflowRunId == $workflowRunId
    and .manifest.workflowRunAttempt == $workflowRunAttempt
    and .manifest.imageReleaseRunId == $imageReleaseRunId
    and .manifest.smoke.status == "passed"
    and .manifest.smoke.evidenceSha256 == $smokeSha256
    and .manifest.migrations.status == "passed"
    and .manifest.migrations.evidenceSha256 == $migrationSha256
    and .manifest.edge == {"changed": false}
    and (.manifest.components | length) == 1
  ' "$manifest_file" >/dev/null

jq -e \
  --arg releaseSha "$release_sha" \
  --slurpfile manifest "$manifest_file" '
    .schemaVersion == 1
    and .repository == "matt2jog/portfolio"
    and .releaseSha == $releaseSha
    and .workflowRunId == $manifest[0].manifest.imageReleaseRunId
    and .imageDigestUri
      == (
        "us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@"
        + $manifest[0].manifest.components[0].imageDigest
      )
  ' "$image_file" >/dev/null

jq -e --slurpfile manifest "$manifest_file" '
  .schemaVersion == 1
  and .serviceId == "portfolio"
  and .status == "passed"
  and .releaseSha == $manifest[0].manifest.releaseSha
  and .imageDigestUri
    == (
      "us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@"
      + $manifest[0].manifest.components[0].imageDigest
    )
' "$migration_file" >/dev/null

jq -e --slurpfile manifest "$manifest_file" '
  .schemaVersion == 1
  and .candidateRevision == $manifest[0].manifest.components[0].candidateRevision
  and .candidateUrl == $manifest[0].manifest.components[0].candidateUrl
  and .imageDigest == $manifest[0].manifest.components[0].imageDigest
  and .checkedAt == $manifest[0].manifest.smoke.checkedAt
  and .originAttestedStatus == 200
  and .previousOriginAttestedStatus == 200
  and .outsideUsOriginAttestedStatus == 451
  and .rawUnauthenticatedStatus == 401
' "$smoke_file" >/dev/null

jq -e --slurpfile manifest "$manifest_file" '
  .schemaVersion == 1
  and .releaseSha == $manifest[0].manifest.releaseSha
  and .blueRevision == $manifest[0].manifest.components[0].expectedBlueRevision
  and .blueDigest == $manifest[0].manifest.components[0].expectedBlueDigest
  and .candidateRevision == $manifest[0].manifest.components[0].candidateRevision
  and .candidateDigest == $manifest[0].manifest.components[0].imageDigest
  and .candidateUrl == $manifest[0].manifest.components[0].candidateUrl
  and .iamBefore == .iamAfterCandidate
  and ([
    .trafficAfterCandidate[]
    | select((.percent // 0) > 0)
  ] | length) == 1
  and ([
    .trafficAfterCandidate[]
    | select((.percent // 0) > 0)
    | select(
      .revisionName == $manifest[0].manifest.components[0].expectedBlueRevision
      and .percent == 100
    )
  ] | length) == 1
' "$rollback_file" >/dev/null

printf 'candidate_sha=%s\n' "$release_sha" >>"$GITHUB_OUTPUT"
printf 'manifest_file=%s\n' "$manifest_file" >>"$GITHUB_OUTPUT"
echo "Verified candidate handoff from failed publication run ${source_run_id}."
