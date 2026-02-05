#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILES=(-f "${ROOT_DIR}/docker-compose.yml" -f "${ROOT_DIR}/docker-compose.enterprise.yml")

VAULT_CONTAINER="law-eye-vault"
VAULT_ADDR="https://127.0.0.1:8200"

DEFAULT_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
DEFAULT_PKI_DIR="${DEFAULT_STATE_HOME}/law-eye/enterprise/pki"
PKI_DIR_RAW="${LAW_EYE_ENTERPRISE_PKI_DIR:-$DEFAULT_PKI_DIR}"
mkdir -p "$PKI_DIR_RAW"
PKI_DIR="$(cd "$PKI_DIR_RAW" && pwd)"
PKI_DIR_ENV="$PKI_DIR"
if command -v cygpath >/dev/null 2>&1; then
  PKI_DIR_ENV="$(cygpath -m "$PKI_DIR")"
fi
export LAW_EYE_ENTERPRISE_PKI_DIR="$PKI_DIR_ENV"

DEFAULT_VAULT_STATE_DIR="${DEFAULT_STATE_HOME}/law-eye/enterprise/vault"
VAULT_STATE_DIR_RAW="${LAW_EYE_ENTERPRISE_VAULT_STATE_DIR:-$DEFAULT_VAULT_STATE_DIR}"
mkdir -p "$VAULT_STATE_DIR_RAW"
VAULT_STATE_DIR="$(cd "$VAULT_STATE_DIR_RAW" && pwd)"

DEFAULT_SECRETS_DIR="${DEFAULT_STATE_HOME}/law-eye/enterprise/secrets"
SECRETS_DIR_RAW="${LAW_EYE_ENTERPRISE_SECRETS_DIR:-$DEFAULT_SECRETS_DIR}"
mkdir -p "$SECRETS_DIR_RAW"
SECRETS_DIR="$(cd "$SECRETS_DIR_RAW" && pwd)"

LEGACY_VAULT_STATE_DIR="${ROOT_DIR}/tmp/enterprise/vault"
LEGACY_SECRETS_DIR="${ROOT_DIR}/tmp/enterprise/secrets"

migrate_legacy_file() {
  local src="$1"
  local dst="$2"
  if [[ -f "$src" && ! -f "$dst" ]]; then
    echo "[rotate] migrating legacy secret file: ${src} -> ${dst}" >&2
    mv "$src" "$dst" 2>/dev/null || { cp "$src" "$dst" && rm -f "$src"; }
    chmod 600 "$dst" >/dev/null 2>&1 || true
  fi
}

if [[ -d "$LEGACY_VAULT_STATE_DIR" ]]; then
  migrate_legacy_file "${LEGACY_VAULT_STATE_DIR}/init.json" "${VAULT_STATE_DIR}/init.json"
  migrate_legacy_file "${LEGACY_VAULT_STATE_DIR}/unseal.key" "${VAULT_STATE_DIR}/unseal.key"
fi
if [[ -d "$LEGACY_SECRETS_DIR" ]]; then
  migrate_legacy_file "${LEGACY_SECRETS_DIR}/postgres_password" "${SECRETS_DIR}/postgres_password"
fi

POSTGRES_PASSWORD_FILE="${SECRETS_DIR}/postgres_password"

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "[rotate] missing required file: $1" >&2
    exit 1
  fi
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

gen_password() {
  python - <<'PY'
import secrets
alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
}

main() {
  require_file "$POSTGRES_PASSWORD_FILE"

  local admin_token
  if ! admin_token="$(vault_login_bootstrap_cert)"; then
    echo "[rotate] failed to login to Vault using cert auth; run vault init first." >&2
    exit 1
  fi

  local old_password
  old_password="$(cat "$POSTGRES_PASSWORD_FILE")"

  local new_password
  new_password="$(gen_password)"

  echo "[rotate] rotating postgres password..."
  docker_exec \
    -e "PGPASSWORD=${old_password}" \
    law-eye-postgres \
    psql -U law_eye -d law_eye -v ON_ERROR_STOP=1 \
    -c "ALTER USER law_eye WITH PASSWORD '${new_password}';" >/dev/null

  echo "${new_password}" > "$POSTGRES_PASSWORD_FILE"
  chmod 600 "$POSTGRES_PASSWORD_FILE" || true

  local db_url
  db_url="postgres://law_eye:${new_password}@postgres:5432/law_eye"

  echo "[rotate] updating Vault KV secrets..."
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv patch secret/law-eye/api database_url="$db_url" >/dev/null

  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv patch secret/law-eye/worker database_url="$db_url" >/dev/null

  echo "[rotate] restarting api/worker to pick up new secrets..."
  docker compose "${COMPOSE_FILES[@]}" restart api worker >/dev/null

  echo "[rotate] ok"
}

main "$@"
