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
VAULT_STATE_DIR="${ROOT_DIR}/tmp/enterprise/vault"
SECRETS_DIR="${ROOT_DIR}/tmp/enterprise/secrets"

ROOT_TOKEN_FILE="${VAULT_STATE_DIR}/root.token"
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

gen_password() {
  python - <<'PY'
import secrets
alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
}

main() {
  require_file "$ROOT_TOKEN_FILE"
  require_file "$POSTGRES_PASSWORD_FILE"

  local root_token
  root_token="$(cat "$ROOT_TOKEN_FILE")"

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
    -e "VAULT_TOKEN=${root_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv patch secret/law-eye/api database_url="$db_url" >/dev/null

  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${root_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv patch secret/law-eye/worker database_url="$db_url" >/dev/null

  echo "[rotate] restarting api/worker to pick up new secrets..."
  docker compose "${COMPOSE_FILES[@]}" restart api worker >/dev/null

  echo "[rotate] ok"
}

main "$@"
