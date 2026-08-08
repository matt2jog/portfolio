#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?Pass the Portfolio base URL as the first argument.}"
base_url="${base_url%/}"
curl_args=(
  --fail
  --silent
  --show-error
  --connect-timeout 5
  --max-time 20
  --retry 5
  --retry-all-errors
  --retry-delay 2
)
if [[ -n "${PORTFOLIO_CURL_RESOLVE:-}" ]]; then
  curl_args+=(--resolve "${PORTFOLIO_CURL_RESOLVE}")
fi

read_json() {
  local label="$1"
  local path="$2"
  local response

  if ! response="$(curl "${curl_args[@]}" "${base_url}${path}")"; then
    echo "::error::Portfolio could not read ${label} from ${path}. Verify that Admin established the Turso career database and that Portfolio can read it; Portfolio will not migrate or write canonical career data." >&2
    return 1
  fi
  if ! jq --exit-status . <<<"${response}" >/dev/null; then
    echo "::error::Portfolio received invalid JSON for ${label} from ${path}. Verify the Admin-owned Turso career data and Portfolio runtime configuration." >&2
    return 1
  fi
  printf '%s' "${response}"
}

require_rows() {
  local label="$1"
  local path="$2"
  local predicate="$3"
  local response count

  response="$(read_json "${label}" "${path}")"
  if ! jq --exit-status "type == \"array\" and length > 0 and all(.[]; ${predicate})" \
    <<<"${response}" >/dev/null; then
    count="$(jq --raw-output 'if type == "array" then length else "not-an-array" end' \
      <<<"${response}" 2>/dev/null || printf 'invalid')"
    echo "::error::Portfolio ${label} contains no usable rows (observed ${count}). Admin must transfer and verify canonical career data before this Portfolio release can continue." >&2
    return 1
  fi
}

require_object() {
  local label="$1"
  local path="$2"
  local predicate="$3"
  local response

  response="$(read_json "${label}" "${path}")"
  if ! jq --exit-status "type == \"object\" and (${predicate})" \
    <<<"${response}" >/dev/null; then
    echo "::error::Portfolio ${label} is absent or unusable. Admin must transfer and verify canonical career data before this Portfolio release can continue." >&2
    return 1
  fi
}

require_rows "projects" "/api/public/projects" \
  '(.id | type == "string" and length > 0) and (.title | type == "string" and length > 0)'
require_rows "experiences" "/api/public/experiences" \
  '(.id | type == "string" and length > 0) and (.role | type == "string" and length > 0) and (.company | type == "string" and length > 0)'
require_rows "skills" "/api/skills-constellation" \
  '(.skill_id | type == "string" and length > 0) and (.skill_name | type == "string" and length > 0) and (.group_name | type == "string" and length > 0)'
require_object "bio" "/api/public/bio" \
  '(.id | type == "string" and length > 0) and (.headline | type == "string" and length > 0) and (.paragraphs | type == "array" and length > 0)'
require_object "personal information" "/api/public/personal-information" \
  '(.id | type == "string" and length > 0) and (.name | type == "string" and length > 0) and (.title | type == "string" and length > 0)'

echo "Portfolio verified nonempty Admin-owned career data through its read-only public API."
