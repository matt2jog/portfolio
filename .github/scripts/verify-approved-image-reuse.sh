#!/usr/bin/env bash
set -euo pipefail

application_sha="${1:-}"
workflow_sha="${2:-}"

[[ "$application_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$workflow_sha" =~ ^[0-9a-f]{40}$ ]]

git cat-file -e "${application_sha}^{commit}"
git cat-file -e "${workflow_sha}^{commit}"
git merge-base --is-ancestor "$application_sha" "$workflow_sha"

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  case "$path" in
    .github/*|src/tests/*)
      ;;
    *)
      echo "Approved image cannot be reused after runtime-affecting change: $path" >&2
      exit 1
      ;;
  esac
done < <(git diff --name-only "$application_sha" "$workflow_sha")
