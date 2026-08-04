#!/bin/sh
set -eu

valid_environment_name() {
  case "$1" in
    [A-Za-z_]*)
      case "$1" in
        *[!A-Za-z0-9_]*) return 1 ;;
        *) return 0 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

apply_environment_aliases() {
  aliases="${INFISICAL_ENV_ALIASES:-}"
  [ -n "${aliases}" ] || return 0

  case "${aliases}" in
    ,*|*,|*,,*)
      echo "infisical-runtime: INFISICAL_ENV_ALIASES is malformed" >&2
      exit 78
      ;;
  esac

  while [ -n "${aliases}" ]; do
    alias_pair="${aliases%%,*}"
    if [ "${alias_pair}" = "${aliases}" ]; then
      aliases=""
    else
      aliases="${aliases#*,}"
    fi

    case "${alias_pair}" in
      *=*)
        target_name="${alias_pair%%=*}"
        source_name="${alias_pair#*=}"
        ;;
      *)
        echo "infisical-runtime: INFISICAL_ENV_ALIASES is malformed" >&2
        exit 78
        ;;
    esac

    if ! valid_environment_name "${target_name}" || \
      ! valid_environment_name "${source_name}"; then
      echo "infisical-runtime: INFISICAL_ENV_ALIASES contains an invalid variable name" >&2
      exit 78
    fi
    case "${source_name}" in
      *=*)
        echo "infisical-runtime: INFISICAL_ENV_ALIASES is malformed" >&2
        exit 78
        ;;
    esac

    source_is_set=""
    eval "source_is_set=\${${source_name}+x}"
    if [ "${source_is_set}" != x ]; then
      echo "infisical-runtime: alias source ${source_name} is not set" >&2
      exit 78
    fi
    source_value=""
    eval "source_value=\${${source_name}-}"
    if [ -z "${source_value}" ]; then
      echo "infisical-runtime: alias source ${source_name} is empty" >&2
      exit 78
    fi
    export "${target_name}=${source_value}"
  done
}

if [ "${1:-}" = "__infisical_runtime_apply_aliases__" ]; then
  shift
  if [ "$#" -eq 0 ]; then
    echo "infisical-runtime: no application command was provided" >&2
    exit 64
  fi
  apply_environment_aliases
  unset INFISICAL_TOKEN
  exec "$@"
fi

if [ "$#" -eq 0 ]; then
  echo "infisical-runtime: no application command was provided" >&2
  exit 64
fi

case "${INFISICAL_RUNTIME_ENABLED:-}" in
  ""|false)
    exec "$@"
    ;;
  true)
    ;;
  *)
    echo "infisical-runtime: INFISICAL_RUNTIME_ENABLED must be true or false" >&2
    exit 64
    ;;
esac

: "${INFISICAL_MACHINE_IDENTITY_ID:?infisical-runtime: INFISICAL_MACHINE_IDENTITY_ID is required}"
: "${INFISICAL_PROJECT_ID:?infisical-runtime: INFISICAL_PROJECT_ID is required}"
: "${INFISICAL_ENVIRONMENT:?infisical-runtime: INFISICAL_ENVIRONMENT is required}"
: "${INFISICAL_SECRET_PATH:?infisical-runtime: INFISICAL_SECRET_PATH is required}"

export INFISICAL_DISABLE_UPDATE_CHECK=true
if ! INFISICAL_TOKEN="$(
  infisical login \
    --method=gcp-id-token \
    --machine-identity-id="${INFISICAL_MACHINE_IDENTITY_ID}" \
    --plain \
    --silent
)"; then
  echo "infisical-runtime: GCP ID-token authentication failed" >&2
  exit 1
fi

if [ -z "${INFISICAL_TOKEN}" ]; then
  echo "infisical-runtime: GCP ID-token authentication returned an empty token" >&2
  exit 1
fi
export INFISICAL_TOKEN

exec infisical run \
  --silent \
  --projectId="${INFISICAL_PROJECT_ID}" \
  --env="${INFISICAL_ENVIRONMENT}" \
  --path="${INFISICAL_SECRET_PATH}" \
  -- "$0" __infisical_runtime_apply_aliases__ "$@"
