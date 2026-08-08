#!/bin/sh
set -eu

runtime_dir="$(CDPATH= cd -P "$(dirname "$0")" && pwd)"
runtime="${runtime_dir}/infisical-runtime.sh"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' 0 1 2 15

mkdir -p "$temporary_dir/bin"
cat > "$temporary_dir/bin/infisical" <<'EOF'
#!/bin/sh
set -eu

case "${1:-}" in
  login)
    printf '%s\n' "test-token"
    ;;
  run)
    shift
    : > "${CAPTURE_FILE:?}"
    while [ "$#" -gt 0 ]; do
      printf '%s\n' "$1" >> "$CAPTURE_FILE"
      if [ "$1" = "--" ]; then
        shift
        exec sh "$@"
      fi
      shift
    done
    exit 64
    ;;
  *)
    exit 64
    ;;
esac
EOF
chmod 0700 "$temporary_dir/bin/infisical"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

run_without_tags() {
  (
    unset INFISICAL_SECRET_TAGS
    PATH="$temporary_dir/bin:$PATH" \
      CAPTURE_FILE="$temporary_dir/arguments" \
      INFISICAL_RUNTIME_ENABLED=true \
      INFISICAL_MACHINE_IDENTITY_ID=test-identity \
      INFISICAL_PROJECT_ID=test-project \
      INFISICAL_ENVIRONMENT=staging \
      INFISICAL_SECRET_PATH=/service \
      sh "$runtime" true
  )
}

run_with_tags() {
  PATH="$temporary_dir/bin:$PATH" \
    CAPTURE_FILE="$temporary_dir/arguments" \
    INFISICAL_RUNTIME_ENABLED=true \
    INFISICAL_MACHINE_IDENTITY_ID=test-identity \
    INFISICAL_PROJECT_ID=test-project \
    INFISICAL_ENVIRONMENT=staging \
    INFISICAL_SECRET_PATH=/service \
    INFISICAL_SECRET_TAGS="$1" \
    sh "$runtime" true
}

run_without_tags
if grep -q '^--tags=' "$temporary_dir/arguments"; then
  fail "the wrapper passed --tags while INFISICAL_SECRET_TAGS was absent"
fi

run_with_tags "shared,service-runtime"
grep -Fqx -- "--tags=shared,service-runtime" "$temporary_dir/arguments" ||
  fail "the wrapper did not pass the validated tag filter as one argument"

for invalid_tags in \
  "" \
  ",shared" \
  "shared," \
  "shared,,service-runtime" \
  "Shared" \
  "shared value" \
  "-shared" \
  "shared-" \
  "shared--runtime" \
  "shared;runtime"
do
  rm -f "$temporary_dir/arguments"
  set +e
  run_with_tags "$invalid_tags" >"$temporary_dir/stdout" 2>"$temporary_dir/stderr"
  status=$?
  set -e
  [ "$status" -eq 78 ] ||
    fail "invalid tag filter '$invalid_tags' exited with $status instead of 78"
  [ ! -e "$temporary_dir/arguments" ] ||
    fail "invalid tag filter '$invalid_tags' reached infisical run"
done

rm -f "$temporary_dir/arguments"
PATH="$temporary_dir/bin:$PATH" \
  CAPTURE_FILE="$temporary_dir/arguments" \
  INFISICAL_RUNTIME_ENABLED=false \
  INFISICAL_SECRET_TAGS="INVALID" \
  sh "$runtime" true
[ ! -e "$temporary_dir/arguments" ] ||
  fail "disabled runtime unexpectedly invoked Infisical"

printf '%s\n' "infisical-runtime tag filtering tests passed"
