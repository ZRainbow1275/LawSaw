#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

VAULT_CONTAINER="law-eye-vault"
VAULT_ADDR="https://127.0.0.1:8200"

DEFAULT_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
DEFAULT_VAULT_STATE_DIR="${DEFAULT_STATE_HOME}/law-eye/enterprise/vault"
VAULT_STATE_DIR_RAW="${LAW_EYE_ENTERPRISE_VAULT_STATE_DIR:-$DEFAULT_VAULT_STATE_DIR}"
mkdir -p "$VAULT_STATE_DIR_RAW"
VAULT_STATE_DIR="$(cd "$VAULT_STATE_DIR_RAW" && pwd)"

LEGACY_VAULT_STATE_DIR="${ROOT_DIR}/tmp/enterprise/vault"

migrate_legacy_file() {
  local name="$1"
  local src="${LEGACY_VAULT_STATE_DIR}/${name}"
  local dst="${VAULT_STATE_DIR}/${name}"
  if [[ -f "$src" && ! -f "$dst" ]]; then
    echo "[revoke] migrating legacy Vault state file: ${src} -> ${dst}" >&2
    mv "$src" "$dst" 2>/dev/null || { cp "$src" "$dst" && rm -f "$src"; }
    chmod 600 "$dst" >/dev/null 2>&1 || true
  fi
}

if [[ -d "$LEGACY_VAULT_STATE_DIR" ]]; then
  migrate_legacy_file "init.json"
  migrate_legacy_file "unseal.key"
fi

usage() {
  echo "Usage: $0 <api|worker>" >&2
  exit 2
}

docker_exec() {
  MSYS2_ARG_CONV_EXCL='*' docker exec "$@"
}

vault_login_bootstrap_cert() {
  set +e
  local login_output
  login_output="$(
    docker_exec \
      -e "VAULT_ADDR=${VAULT_ADDR}" \
      -e "VAULT_CACERT=/vault/tls/ca.crt" \
      -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
      -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
      "$VAULT_CONTAINER" vault write -format=json auth/cert/login name=law-eye-bootstrap 2>/dev/null
  )"
  local login_code=$?
  set -e

  if [[ $login_code -ne 0 || -z "$login_output" ]]; then
    return 1
  fi

  local token
  token="$(
    printf '%s' "$login_output" | python - <<'PY'
import json
import sys

try:
    data = json.load(sys.stdin)
    auth = data.get("auth") or {}
    sys.stdout.write(str(auth.get("client_token", "")).strip())
except Exception:
    sys.stdout.write("")
PY
  )"

  token="$(printf '%s' "$token" | tr -d '\r\n')"
  [[ -n "$token" ]] || return 1
  printf '%s' "$token"
}

main() {
  local target="${1:-}"
  case "$target" in
    api|worker) ;;
    *) usage ;;
  esac

  local admin_token
  if ! admin_token="$(vault_login_bootstrap_cert)"; then
    echo "[revoke] failed to login to Vault using cert auth; run vault init first." >&2
    exit 1
  fi

  echo "[revoke] revoking $target client certificate mapping..."
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault delete "auth/cert/certs/law-eye-${target}" >/dev/null

  echo "[revoke] ok"
}

main "$@"
