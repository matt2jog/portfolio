#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-}" == "production" && ( "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REPOSITORY:-}" != "matt2jog/portfolio" || "${GITHUB_REF:-}" != "refs/heads/main" || "${GITHUB_WORKFLOW_REF:-}" != "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main" ) ]]; then
  echo "Production Cloudflare mutation is allowed only from GitHub Actions matt2jog/portfolio refs/heads/main." >&2
  exit 2
fi

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?CLOUDFLARE_ZONE_ID is required}"

MODE="${1:-deploy}"
EDGE_DIR="infra/cloudflare/portfolio-edge"
WORKER_NAME="portfolio-edge"
ROUTE_TOOL="src/scripts/release/cloudflare-routes.ts"
ROLLBACK_STATE_FILE="${EDGE_ROLLBACK_STATE_FILE:-${RUNNER_TEMP:-/tmp}/portfolio-edge-rollback-state.json}"
CUSTOM_URLS=("https://2jog.dev" "https://www.2jog.dev")

worker_version() {
  local deployment_status error_file status
  error_file="$(mktemp)"
  if deployment_status="$(cd "$EDGE_DIR" && npx wrangler deployments status --name "$WORKER_NAME" --json 2>"$error_file")"; then
    status=0
  else
    status=$?
    if grep -Eq 'code:[[:space:]]*10007' "$error_file"; then
      rm -f "$error_file"
      return 3
    fi
    cat "$error_file" >&2
    rm -f "$error_file"
    return "${status:-1}"
  fi
  rm -f "$error_file"
  jq -er '
    if (.versions | type) != "array" then
      error("Cloudflare deployment status did not contain a versions array")
    else
      [.versions[] | select((.percentage | tonumber) == 100) | .version_id]
      | if length != 1 then
          error("Cloudflare deployment status did not identify exactly one active version")
        elif (.[0] | type) != "string" or .[0] == "" then
          error("Cloudflare deployment status contained an invalid active version")
        else
          .[0]
        end
    end
  ' <<<"$deployment_status"
}

verify_edge() {
  local url response headers
  headers="$(mktemp)"
  for url in "${CUSTOM_URLS[@]}"; do
    if ! response="$(curl --fail --silent --show-error --retry 4 --retry-delay 2 --retry-all-errors \
      --connect-timeout 10 --max-time 30 --dump-header "$headers" "${url%/}/__edge/health")"; then
      rm -f "$headers"
      return 1
    fi
    jq -e '.ok == true and .worker == "portfolio-edge"' <<<"$response" >/dev/null
    if ! grep -Eqi '^x-2jog-edge:[[:space:]]*portfolio-edge\r?$' "$headers"; then
      rm -f "$headers"
      return 1
    fi

    : >"$headers"
    if ! curl --fail --silent --show-error --retry 4 --retry-delay 2 --retry-all-errors \
      --connect-timeout 10 --max-time 30 --dump-header "$headers" --output /dev/null "${url%/}/" \
      || ! grep -Eqi '^x-2jog-edge:[[:space:]]*portfolio-edge\r?$' "$headers"; then
      rm -f "$headers"
      return 1
    fi
  done
  rm -f "$headers"
}

restore_from_state() {
  test -s "$ROLLBACK_STATE_FILE"
  local prior_version candidate_version prior_routes_owned current_version snapshot_file
  prior_version="$(jq -r '.prior_version // empty' "$ROLLBACK_STATE_FILE")"
  candidate_version="$(jq -r '.candidate_version // empty' "$ROLLBACK_STATE_FILE")"
  prior_routes_owned="$(jq -r '.prior_routes_owned_by_worker' "$ROLLBACK_STATE_FILE")"
  if [[ -z "$candidate_version" && -z "$prior_version" ]]; then
    echo "No Portfolio edge version was changed; the route snapshot remains available for restoration."
    return 0
  fi
  if [[ -z "$candidate_version" ]]; then
    echo "Portfolio edge candidate version is unknown; refusing automatic rollback with only the route snapshot." >&2
    return 1
  fi
  if ! current_version="$(worker_version)"; then
    echo "Portfolio edge current-version introspection failed during rollback." >&2
    return 1
  fi
  if [[ -n "$candidate_version" && "$current_version" != "$candidate_version" ]]; then
    echo "Portfolio edge no longer runs this release version; refusing automatic rollback."
    return 1
  fi

  if [[ "$prior_routes_owned" == "true" && -n "$prior_version" ]]; then
    if [[ "$current_version" == "$prior_version" ]]; then
      return
    fi
    (cd "$EDGE_DIR" && npx wrangler rollback "$prior_version" \
      --name "$WORKER_NAME" --yes \
      --message "Coordinated rollback of Portfolio edge")
    test "$(worker_version)" = "$prior_version"
    return
  fi

  snapshot_file="$(mktemp)"
  jq '.route_snapshot' "$ROLLBACK_STATE_FILE" >"$snapshot_file"
  if ! npx tsx "$ROUTE_TOOL" restore "$snapshot_file" "$WORKER_NAME"; then
    rm -f "$snapshot_file"
    return 1
  fi
  rm -f "$snapshot_file"
}

restore_after_failed_deploy() {
  if ! restore_from_state; then
    echo "Portfolio edge restoration failed; manual intervention is required." >&2
    return 1
  fi
}

if [[ "$MODE" == "preflight" ]]; then
  route_snapshot="$(mktemp)"
  cleanup_preflight() { rm -f "$route_snapshot"; }
  trap cleanup_preflight EXIT
  npx tsx "$ROUTE_TOOL" snapshot "$route_snapshot"
  route_ownership="$(jq -er --arg worker "$WORKER_NAME" '
    if (.schema_version != 1 or (.routes | type) != "array" or (.routes | length) != 2) then
      error("Cloudflare route snapshot is incomplete")
    else
      ([.routes[] | select(.script == $worker)] | length) as $owned
      | if $owned == 0 then "legacy"
        elif $owned == 2 then "target"
        else error("Cloudflare Portfolio routes have mixed owners")
        end
    end
  ' "$route_snapshot")"
  if [[ "$route_ownership" == "target" ]]; then
    worker_version >/dev/null
  fi
  echo "Portfolio edge route ownership is readable and internally consistent: ${route_ownership}."
  exit 0
fi

if [[ "$MODE" == "rollback" ]]; then
  restore_from_state
  echo "Restored the prior Portfolio edge version or route owners."
  exit 0
fi
if [[ "$MODE" != "deploy" ]]; then
  echo "Unknown Portfolio edge mode: $MODE" >&2
  exit 2
fi

: "${EDGE_ORIGIN_TOKEN:?EDGE_ORIGIN_TOKEN is required}"
if [[ ! "$EDGE_ORIGIN_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "EDGE_ORIGIN_TOKEN must be a 32-256 character URL-safe token." >&2
  exit 2
fi

route_snapshot="$(mktemp)"
secrets_file="$(mktemp)"
cleanup() { rm -f "$route_snapshot" "$secrets_file"; }
trap cleanup EXIT
chmod 600 "$route_snapshot" "$secrets_file"

npx tsx "$ROUTE_TOOL" snapshot "$route_snapshot"

# Persist a valid route snapshot before any prior-version or ownership
# introspection. If either read fails, the release stops with a restorable
# snapshot instead of guessing which Worker or routes are active.
prior_version=""
prior_routes_owned_by_worker=false
jq -n \
  --arg prior_version "$prior_version" \
  --arg candidate_version "" \
  --argjson prior_routes_owned_by_worker "$prior_routes_owned_by_worker" \
  --slurpfile route_snapshot "$route_snapshot" \
  '{
    schema_version: 1,
    worker: "portfolio-edge",
    prior_version: $prior_version,
    candidate_version: $candidate_version,
    prior_routes_owned_by_worker: $prior_routes_owned_by_worker,
    route_snapshot: $route_snapshot[0]
  }' >"$ROLLBACK_STATE_FILE"
chmod 600 "$ROLLBACK_STATE_FILE"

prior_version_status=0
prior_version="$(worker_version)" || prior_version_status=$?
if [[ "$prior_version_status" == 3 ]]; then
  prior_version=""
elif [[ "$prior_version_status" != 0 ]]; then
  echo "Cloudflare prior-version introspection failed; no edge deployment will be attempted." >&2
  restore_after_failed_deploy
  exit 1
fi
if ! route_ownership="$(jq -er --arg worker "$WORKER_NAME" '
  if (.schema_version != 1 or (.routes | type) != "array" or (.routes | length) != 2) then
    error("Cloudflare route snapshot is incomplete")
  else
    ([.routes[] | select(.script == $worker)] | length) as $owned
    | if $owned == 0 then "legacy"
      elif $owned == 2 then "target"
      else error("Cloudflare Portfolio routes have mixed owners")
      end
  end
' "$route_snapshot")"; then
  echo "Cloudflare route ownership introspection failed; no edge deployment will be attempted." >&2
  restore_after_failed_deploy
  exit 1
fi
prior_routes_owned_by_worker=false
if [[ "$route_ownership" == "target" ]]; then
  prior_routes_owned_by_worker=true
fi
if [[ -z "$prior_version" && "$prior_routes_owned_by_worker" == true ]]; then
  echo "Portfolio routes reference a target Worker that Cloudflare reports as absent." >&2
  restore_after_failed_deploy
  exit 1
fi

jq -n --arg token "$EDGE_ORIGIN_TOKEN" '{ORIGIN_ACCESS_TOKEN: $token}' >"$secrets_file"

jq -n \
  --arg prior_version "$prior_version" \
  --argjson prior_routes_owned_by_worker "$prior_routes_owned_by_worker" \
  --slurpfile route_snapshot "$route_snapshot" \
  '{
    schema_version: 1,
    worker: "portfolio-edge",
    prior_version: $prior_version,
    candidate_version: "",
    prior_routes_owned_by_worker: $prior_routes_owned_by_worker,
    route_snapshot: $route_snapshot[0]
  }' >"$ROLLBACK_STATE_FILE"
chmod 600 "$ROLLBACK_STATE_FILE"

if ! (cd "$EDGE_DIR" && npx wrangler deploy --secrets-file "$secrets_file"); then
  failed_deploy_version_status=0
  failed_deploy_version="$(worker_version)" || failed_deploy_version_status=$?
  if [[ "$failed_deploy_version_status" == 0 ]]; then
    state_update="$(mktemp)"
    jq --arg candidate_version "$failed_deploy_version" \
      '.candidate_version = $candidate_version' "$ROLLBACK_STATE_FILE" >"$state_update"
    mv "$state_update" "$ROLLBACK_STATE_FILE"
    chmod 600 "$ROLLBACK_STATE_FILE"
  elif [[ "$failed_deploy_version_status" != 3 || -n "$prior_version" ]]; then
    echo "Cloudflare state after the failed edge deploy is unknown; manual intervention is required." >&2
    exit 1
  fi
  restore_after_failed_deploy
  exit 1
fi

if ! candidate_version="$(worker_version)"; then
  echo "Cloudflare could not confirm the new portfolio-edge production version." >&2
  restore_after_failed_deploy
  exit 1
fi
if [[ -z "$candidate_version" ]]; then
  echo "Cloudflare did not report a portfolio-edge production version." >&2
  restore_after_failed_deploy
  exit 1
fi
if [[ -n "$prior_version" && "$candidate_version" == "$prior_version" ]]; then
  echo "Cloudflare did not create a new portfolio-edge production version." >&2
  restore_after_failed_deploy
  exit 1
fi

jq -n \
  --arg prior_version "$prior_version" \
  --arg candidate_version "$candidate_version" \
  --argjson prior_routes_owned_by_worker "$prior_routes_owned_by_worker" \
  --slurpfile route_snapshot "$route_snapshot" \
  '{
    schema_version: 1,
    worker: "portfolio-edge",
    prior_version: $prior_version,
    candidate_version: $candidate_version,
    prior_routes_owned_by_worker: $prior_routes_owned_by_worker,
    route_snapshot: $route_snapshot[0]
  }' >"$ROLLBACK_STATE_FILE"
chmod 600 "$ROLLBACK_STATE_FILE"

if ! npx tsx "$ROUTE_TOOL" verify "$WORKER_NAME" || ! verify_edge; then
  restore_after_failed_deploy
  exit 1
fi

echo "Verified ${WORKER_NAME}, its exact routes, and both Portfolio custom domains."
