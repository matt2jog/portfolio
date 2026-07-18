#!/usr/bin/env bash
set -euo pipefail

run_id="${1:-}"
expected_sha="${2:-}"
destination="${3:-}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
[[ "$run_id" =~ ^[1-9][0-9]*$ ]]
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]]
test -n "$destination"

run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}")"
jq -e --arg sha "$expected_sha" '
  .head_sha == $sha and .status == "completed" and .conclusion == "success" and
  .path == ".github/workflows/release-image.yml" and
  (.event == "push" or .event == "workflow_dispatch")
' <<<"$run_json" >/dev/null

artifacts_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/artifacts?per_page=100")"
artifact_id="$(jq -er --arg sha "$expected_sha" '
  [.artifacts[] | select(.expired == false and .name == ("portfolio-release-image-" + $sha))] |
  if length == 1 then .[0].id else error("expected exactly one release-image artifact") end
' <<<"$artifacts_json")"
archive="$(mktemp)"
directory="$(mktemp -d)"
cleanup() { rm -f "$archive"; rm -rf "$directory"; }
trap cleanup EXIT
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${artifact_id}/zip" >"$archive"
test "$(unzip -Z1 "$archive" | wc -l)" -eq 1
test "$(unzip -Z1 "$archive")" = "portfolio-release-image.json"
unzip -q "$archive" -d "$directory"
image_uri="$(npx tsx src/scripts/release/release-image-record.ts "$directory/portfolio-release-image.json" "$expected_sha" "$run_id")"
install -m 600 "$directory/portfolio-release-image.json" "$destination"
printf '%s\n' "$image_uri"
