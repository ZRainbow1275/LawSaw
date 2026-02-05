#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

COMPOSE_FILES=(-f "${ROOT_DIR}/docker-compose.yml" -f "${ROOT_DIR}/docker-compose.enterprise.yml")

VAULT_CONTAINER="law-eye-vault"
VAULT_ADDR="https://127.0.0.1:8200"

DOTENV_FILE="${ROOT_DIR}/.env"

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
    echo "[vault] migrating legacy secret file: ${src} -> ${dst}" >&2
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

LEGACY_INIT_JSON_FILE="${VAULT_STATE_DIR}/init.json"
UNSEAL_KEY_FILE="${VAULT_STATE_DIR}/unseal.key"
LEGACY_ROOT_TOKEN_FILE="${VAULT_STATE_DIR}/root.token"
LEGACY_REPO_ROOT_TOKEN_FILE="${LEGACY_VAULT_STATE_DIR}/root.token"

# Root token is only used during one-time bootstrap and must never be persisted.
VAULT_SETUP_ROOT_TOKEN=""
VAULT_ADMIN_TOKEN=""

VAULT_UNSEAL_KEY_SHARES="${LAW_EYE_ENTERPRISE_VAULT_UNSEAL_KEY_SHARES:-5}"
VAULT_UNSEAL_KEY_THRESHOLD="${LAW_EYE_ENTERPRISE_VAULT_UNSEAL_KEY_THRESHOLD:-3}"

CA_CERT="${PKI_DIR}/ca.crt"
BOOTSTRAP_CLIENT_CERT="${PKI_DIR}/vault-bootstrap-client.crt"
BOOTSTRAP_CLIENT_KEY="${PKI_DIR}/vault-bootstrap-client.key"

API_CLIENT_CERT="${PKI_DIR}/vault-api-client.crt"
WORKER_CLIENT_CERT="${PKI_DIR}/vault-worker-client.crt"

POSTGRES_PASSWORD_FILE="${SECRETS_DIR}/postgres_password"

PYTHON_BIN=""

resolve_python() {
  if [[ -n "$PYTHON_BIN" ]]; then
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
    return 0
  fi

  if command -v python.exe >/dev/null 2>&1; then
    PYTHON_BIN="python.exe"
    return 0
  fi

  echo "[vault] missing required binary: python/python3/python.exe" >&2
  exit 1
}

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[vault] missing required binary: $1" >&2
    exit 1
  fi
}

docker_exec() {
  # Git Bash (MSYS2) will convert POSIX-like paths (e.g. `/vault/...`) into Windows paths when
  # calling `docker.exe`, which breaks container file references. Disable arg conversion.
  MSYS2_ARG_CONV_EXCL='*' docker exec "$@"
}

json_get() {
  local key="$1"
  local file="$2"
  resolve_python
  "$PYTHON_BIN" - "$key" "$file" <<'PY'
import json
import sys

key = sys.argv[1]
path = sys.argv[2]

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

cur = data
for part in key.split("."):
    if isinstance(cur, list):
        part = int(part)
    cur = cur[part]
sys.stdout.write(str(cur))
PY
}

read_trimmed() {
  tr -d '\r\n' < "$1"
}

ensure_tls() {
  echo "[vault] ensure TLS materials..."
  "${ROOT_DIR}/scripts/enterprise/tls-gen.sh" >/dev/null

  if [[ ! -f "$CA_CERT" ]]; then
    echo "[vault] CA cert not found: $CA_CERT" >&2
    exit 1
  fi
  if [[ ! -f "$BOOTSTRAP_CLIENT_CERT" || ! -f "$BOOTSTRAP_CLIENT_KEY" ]]; then
    echo "[vault] bootstrap client cert/key missing under: $PKI_DIR" >&2
    exit 1
  fi
  if [[ ! -f "$API_CLIENT_CERT" || ! -f "$WORKER_CLIENT_CERT" ]]; then
    echo "[vault] api/worker client cert missing under: $PKI_DIR" >&2
    exit 1
  fi
}

gen_password() {
  resolve_python
  "$PYTHON_BIN" - <<'PY'
import secrets
alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
}

dotenv_get() {
  local key="$1"
  if [[ ! -f "$DOTENV_FILE" ]]; then
    return 1
  fi

  local line=""
  while IFS= read -r raw; do
    [[ "$raw" =~ ^[[:space:]]*# ]] && continue
    [[ "$raw" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$raw" == "${key}="* ]]; then
      line="$raw"
    fi
  done < "$DOTENV_FILE"

  [[ -z "$line" ]] && return 1
  printf '%s' "${line#${key}=}"
}

ensure_secrets_files() {
  mkdir -p "$SECRETS_DIR"

  if [[ ! -f "$POSTGRES_PASSWORD_FILE" ]]; then
    echo "[vault] preparing postgres password file..."
    local password="${POSTGRES_PASSWORD:-}"
    if [[ -z "$password" ]]; then
      password="$(dotenv_get POSTGRES_PASSWORD || true)"
    fi
    if [[ -z "$password" ]]; then
      password="$(gen_password)"
    fi
    echo "$password" > "$POSTGRES_PASSWORD_FILE"
    chmod 600 "$POSTGRES_PASSWORD_FILE" || true
  fi
}

compose_up_vault() {
  echo "[vault] starting vault container..."
  docker compose "${COMPOSE_FILES[@]}" up -d vault >/dev/null
}

vault_exec() {
  # shellcheck disable=SC2068
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault "$@"
}

vault_login_bootstrap_cert() {
  set +e
  local login_output
  login_output="$(vault_exec write -format=json auth/cert/login name=law-eye-bootstrap 2>/dev/null)"
  local login_code=$?
  set -e

  if [[ $login_code -ne 0 || -z "$login_output" ]]; then
    return 1
  fi

  resolve_python
  local token
  token="$(
    printf '%s' "$login_output" | "$PYTHON_BIN" - <<'PY'
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

ensure_vault_admin_token() {
  if [[ -n "$VAULT_ADMIN_TOKEN" ]]; then
    return 0
  fi

  local token
  token="$(vault_login_bootstrap_cert || true)"
  token="$(printf '%s' "$token" | tr -d '\r\n')"
  if [[ -n "$token" ]]; then
    VAULT_ADMIN_TOKEN="$token"
    return 0
  fi

  return 1
}

wait_vault_ready() {
  echo "[vault] waiting for vault to accept connections..."
  for _ in {1..60}; do
    set +e
    vault_exec status >/dev/null 2>&1
    local code=$?
    set -e
    # Vault CLI returns:
    # - 0: unsealed
    # - 2: sealed
    # - 1: not reachable / error
    if [[ $code -eq 0 || $code -eq 2 ]]; then
      return 0
    fi
    sleep 1
  done

  echo "[vault] vault did not become ready in time." >&2
  exit 1
}

reset_vault_data() {
  local project_name
  project_name="$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]')"

  local volume_name="${project_name}_vault_data"

  echo "[vault] resetting local Vault data volume: ${volume_name}"
  docker rm -f "$VAULT_CONTAINER" >/dev/null 2>&1 || true

  # Remove any orphan containers still holding the volume.
  docker ps -a --filter "volume=${volume_name}" --format '{{.Names}}' | while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    docker rm -f "$name" >/dev/null 2>&1 || true
  done

  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  rm -f "$LEGACY_INIT_JSON_FILE" "$UNSEAL_KEY_FILE" "$LEGACY_ROOT_TOKEN_FILE" || true
}

init_and_unseal() {
  mkdir -p "$VAULT_STATE_DIR"

  # Legacy cleanup: `init.json` used to contain BOTH unseal keys and the root token.
  # We must not keep it on disk. Extract what we need, then remove it.
  if [[ -s "$LEGACY_INIT_JSON_FILE" ]]; then
    echo "[vault] WARNING: found legacy init.json with sensitive material; extracting required values and removing it..." >&2

    resolve_python
    legacy_root_token="$(
      "$PYTHON_BIN" - "$LEGACY_INIT_JSON_FILE" "$UNSEAL_KEY_FILE" "$VAULT_UNSEAL_KEY_SHARES" <<'PY'
import json
import os
import sys

init_path = sys.argv[1]
unseal_path = sys.argv[2]
shares = int(sys.argv[3])

with open(init_path, "r", encoding="utf-8") as f:
    data = json.load(f)

keys = data.get("unseal_keys_b64") or []
if len(keys) < shares:
    raise SystemExit(f"expected at least {shares} unseal keys, got {len(keys)}")

if not os.path.exists(unseal_path) or os.path.getsize(unseal_path) == 0:
    with open(unseal_path, "w", encoding="utf-8") as f:
        for key in keys[:shares]:
            f.write(str(key).strip() + "\n")

print(str(data.get("root_token", "")).strip())
PY
    )"

    chmod 600 "$UNSEAL_KEY_FILE" >/dev/null 2>&1 || true
    rm -f "$LEGACY_INIT_JSON_FILE" || true

    if [[ -z "$VAULT_SETUP_ROOT_TOKEN" && -n "$legacy_root_token" ]]; then
      VAULT_SETUP_ROOT_TOKEN="$(printf '%s' "$legacy_root_token" | tr -d '\r\n')"
    fi
  fi

  # Legacy cleanup: root token must never live under the repo (tmp/enterprise/vault).
  if [[ -s "$LEGACY_REPO_ROOT_TOKEN_FILE" && -z "$VAULT_SETUP_ROOT_TOKEN" ]]; then
    echo "[vault] WARNING: found legacy root token under repo tmp dir; consuming and deleting it..." >&2
    VAULT_SETUP_ROOT_TOKEN="$(tr -d '\r\n' < "$LEGACY_REPO_ROOT_TOKEN_FILE")"
    rm -f "$LEGACY_REPO_ROOT_TOKEN_FILE" || true
  fi

  # Legacy cleanup: root token must never live on disk. If present, consume it in-memory for
  # bootstrap only (configure_vault will revoke & delete it).
  if [[ -s "$LEGACY_ROOT_TOKEN_FILE" && -z "$VAULT_SETUP_ROOT_TOKEN" ]]; then
    echo "[vault] WARNING: found legacy root token file; consuming and deleting it..." >&2
    VAULT_SETUP_ROOT_TOKEN="$(tr -d '\r\n' < "$LEGACY_ROOT_TOKEN_FILE")"
    rm -f "$LEGACY_ROOT_TOKEN_FILE" || true
  fi

  if [[ ! -s "$UNSEAL_KEY_FILE" ]]; then
    echo "[vault] initializing (operator init)..."
    rm -f "$UNSEAL_KEY_FILE" || true

    set +e
    local init_output
    init_output="$(vault_exec operator init -key-shares="$VAULT_UNSEAL_KEY_SHARES" -key-threshold="$VAULT_UNSEAL_KEY_THRESHOLD" -format=json 2>&1)"
    local init_code=$?
    set -e

    if [[ $init_code -ne 0 ]]; then
      if echo "$init_output" | grep -qi "already initialized"; then
        echo "[vault] vault is already initialized but local init materials are missing; resetting..."
        reset_vault_data
        compose_up_vault
        wait_vault_ready

        set +e
        init_output="$(vault_exec operator init -key-shares="$VAULT_UNSEAL_KEY_SHARES" -key-threshold="$VAULT_UNSEAL_KEY_THRESHOLD" -format=json 2>&1)"
        init_code=$?
        set -e
      fi
    fi

    if [[ $init_code -ne 0 ]]; then
      echo "[vault] failed to initialize vault (exit=$init_code):" >&2
      echo "$init_output" >&2
      exit 1
    fi

    resolve_python
    VAULT_SETUP_ROOT_TOKEN="$(
      printf '%s' "$init_output" | "$PYTHON_BIN" - "$UNSEAL_KEY_FILE" "$VAULT_UNSEAL_KEY_SHARES" <<'PY'
import json
import sys

unseal_path = sys.argv[1]
shares = int(sys.argv[2])

data = json.load(sys.stdin)
keys = data.get("unseal_keys_b64") or []
if len(keys) < shares:
    raise SystemExit(f"expected at least {shares} unseal keys, got {len(keys)}")

with open(unseal_path, "w", encoding="utf-8") as f:
    for key in keys[:shares]:
        f.write(str(key).strip() + "\n")

print(str(data.get("root_token", "")).strip())
PY
    )"

    VAULT_SETUP_ROOT_TOKEN="$(printf '%s' "$VAULT_SETUP_ROOT_TOKEN" | tr -d '\r\n')"
    if [[ -z "$VAULT_SETUP_ROOT_TOKEN" ]]; then
      echo "[vault] failed to read root token from init output" >&2
      exit 1
    fi

    chmod 600 "$UNSEAL_KEY_FILE" >/dev/null 2>&1 || true
  fi

  set +e
  vault_exec status >/dev/null 2>&1
  local status_code=$?
  set -e
  if [[ $status_code -eq 0 ]]; then
    echo "[vault] already unsealed."
    return 0
  fi

  if [[ $status_code -ne 2 ]]; then
    echo "[vault] vault status unexpected (exit=$status_code)" >&2
    exit 1
  fi

  if [[ "$VAULT_UNSEAL_KEY_THRESHOLD" -gt "$VAULT_UNSEAL_KEY_SHARES" ]]; then
    echo "[vault] invalid unseal settings: threshold > shares" >&2
    exit 1
  fi

  echo "[vault] unsealing..."
  local count=0
  while IFS= read -r unseal_key; do
    [[ -z "$unseal_key" ]] && continue
    vault_exec operator unseal "$unseal_key" >/dev/null
    count=$((count + 1))
    if [[ $count -ge $VAULT_UNSEAL_KEY_THRESHOLD ]]; then
      break
    fi
  done < "$UNSEAL_KEY_FILE"

  if [[ $count -lt $VAULT_UNSEAL_KEY_THRESHOLD ]]; then
    echo "[vault] not enough unseal keys available (have=$count need=$VAULT_UNSEAL_KEY_THRESHOLD)" >&2
    exit 1
  fi
}

configure_vault() {
  echo "[vault] configuring secrets engine + auth methods + policies..."
  if ! ensure_vault_admin_token; then
    if [[ -z "$VAULT_SETUP_ROOT_TOKEN" ]]; then
      echo "[vault] ERROR: cannot authenticate to Vault: cert auth not ready and no setup root token available." >&2
      echo "[vault] Hint: reset Vault data volume and rerun this script to re-initialize." >&2
      exit 1
    fi

    echo "[vault] bootstrapping cert auth (one-time) using in-memory root token..." >&2
    local root_token="$VAULT_SETUP_ROOT_TOKEN"

    docker_exec \
      -e "VAULT_ADDR=${VAULT_ADDR}" \
      -e "VAULT_TOKEN=${root_token}" \
      -e "VAULT_CACERT=/vault/tls/ca.crt" \
      -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
      -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
      "$VAULT_CONTAINER" vault auth enable cert >/dev/null 2>&1 || true

    docker_exec -i \
      -e "VAULT_ADDR=${VAULT_ADDR}" \
      -e "VAULT_TOKEN=${root_token}" \
      -e "VAULT_CACERT=/vault/tls/ca.crt" \
      -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
      -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
      "$VAULT_CONTAINER" vault policy write law-eye-bootstrap - <<'EOF'
path "sys/mounts" {
  capabilities = ["read"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "sys/auth" {
  capabilities = ["read"]
}

path "sys/auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "sys/policies/acl" {
  capabilities = ["list"]
}

path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/cert/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/data/law-eye/*" {
  capabilities = ["create", "read", "update"]
}

path "secret/metadata/law-eye/*" {
  capabilities = ["read", "list"]
}

path "transit/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF

    docker_exec \
      -e "VAULT_ADDR=${VAULT_ADDR}" \
      -e "VAULT_TOKEN=${root_token}" \
      -e "VAULT_CACERT=/vault/tls/ca.crt" \
      -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
      -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
      "$VAULT_CONTAINER" vault write auth/cert/certs/law-eye-bootstrap \
      display_name="law-eye-bootstrap" \
      policies="law-eye-bootstrap" \
      certificate=@/vault/tls/vault-bootstrap-client.crt >/dev/null

    if ! ensure_vault_admin_token; then
      echo "[vault] ERROR: failed to login via cert auth after bootstrap." >&2
      exit 1
    fi

    docker_exec \
      -e "VAULT_ADDR=${VAULT_ADDR}" \
      -e "VAULT_TOKEN=${root_token}" \
      -e "VAULT_CACERT=/vault/tls/ca.crt" \
      -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
      -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
      "$VAULT_CONTAINER" vault token revoke -self >/dev/null 2>&1 || true
    VAULT_SETUP_ROOT_TOKEN=""
  fi

  local admin_token="$VAULT_ADMIN_TOKEN"

  # Enable KV v2 at `secret/`
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true

  # Enable cert auth.
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault auth enable cert >/dev/null 2>&1 || true

  # Enable transit for encryption-as-a-service.
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault secrets enable transit >/dev/null 2>&1 || true

  # Ensure transit key exists for feedback field encryption (ENC-301).
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault write -f transit/keys/law-eye-feedback type=aes256-gcm96 >/dev/null 2>&1 || true

  # Policies: keep least-privilege by separating API/worker paths.
  docker_exec -i \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault policy write law-eye-api - <<'EOF'
path "secret/data/law-eye/api" {
  capabilities = ["read"]
}

path "secret/metadata/law-eye/api" {
  capabilities = ["list"]
}

path "transit/encrypt/law-eye-feedback" {
  capabilities = ["update"]
}

path "transit/decrypt/law-eye-feedback" {
  capabilities = ["update"]
}
EOF

  docker_exec -i \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault policy write law-eye-worker - <<'EOF'
path "secret/data/law-eye/worker" {
  capabilities = ["read"]
}

path "secret/metadata/law-eye/worker" {
  capabilities = ["list"]
}

path "transit/encrypt/law-eye-feedback" {
  capabilities = ["update"]
}

path "transit/decrypt/law-eye-feedback" {
  capabilities = ["update"]
}
EOF

  # Map client certs to policies.
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault write auth/cert/certs/law-eye-api \
    display_name="law-eye-api" \
    policies="law-eye-api" \
    certificate=@/vault/tls/vault-api-client.crt >/dev/null

  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault write auth/cert/certs/law-eye-worker \
    display_name="law-eye-worker" \
    policies="law-eye-worker" \
    certificate=@/vault/tls/vault-worker-client.crt >/dev/null

  rm -f "$LEGACY_ROOT_TOKEN_FILE" "$LEGACY_REPO_ROOT_TOKEN_FILE" || true
}

seed_secrets() {
  echo "[vault] seeding secrets into kv..."
  local postgres_password
  postgres_password="$(cat "$POSTGRES_PASSWORD_FILE")"

  local db_url
  db_url="postgres://law_eye:${postgres_password}@postgres:5432/law_eye"

  local redis_url
  local redis_password="${REDIS_PASSWORD:-}"
  if [[ -z "$redis_password" ]]; then
    redis_password="$(dotenv_get REDIS_PASSWORD || true)"
  fi
  if [[ -z "$redis_password" ]]; then
    echo "[vault] ERROR: REDIS_PASSWORD is required (for redis://:***@redis:6379)" >&2
    exit 1
  fi
  redis_url="redis://:${redis_password}@redis:6379"

  local s3_access_key_id="${MINIO_ROOT_USER:-}"
  if [[ -z "$s3_access_key_id" ]]; then
    s3_access_key_id="$(dotenv_get MINIO_ROOT_USER || true)"
  fi

  local s3_secret_access_key="${MINIO_ROOT_PASSWORD:-}"
  if [[ -z "$s3_secret_access_key" ]]; then
    s3_secret_access_key="$(dotenv_get MINIO_ROOT_PASSWORD || true)"
  fi

  if [[ -z "$s3_access_key_id" || -z "$s3_secret_access_key" ]]; then
    echo "[vault] ERROR: MINIO_ROOT_USER/MINIO_ROOT_PASSWORD are required (for object storage)" >&2
    exit 1
  fi

  local s3_endpoint="http://minio:9000"
  local s3_region="us-east-1"
  local s3_bucket="law-eye"

  local openai_api_key="${OPENAI_API_KEY:-}"
  if [[ -z "$openai_api_key" ]]; then
    openai_api_key="$(dotenv_get OPENAI_API_KEY || true)"
  fi

  local openai_base_url="${OPENAI_BASE_URL:-}"
  if [[ -z "$openai_base_url" ]]; then
    openai_base_url="$(dotenv_get OPENAI_BASE_URL || true)"
  fi
  if [[ -z "$openai_base_url" ]]; then
    openai_base_url="https://api.openai.com/v1"
  fi

  if [[ -z "$VAULT_ADMIN_TOKEN" ]]; then
    if ! ensure_vault_admin_token; then
      echo "[vault] ERROR: missing Vault admin token; did configure_vault run successfully?" >&2
      exit 1
    fi
  fi
  local admin_token="$VAULT_ADMIN_TOKEN"

  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv put secret/law-eye/api \
    database_url="$db_url" \
    redis_url="$redis_url" \
    openai_api_key="$openai_api_key" \
    openai_base_url="$openai_base_url" \
    s3_endpoint="$s3_endpoint" \
    s3_region="$s3_region" \
    s3_bucket="$s3_bucket" \
    s3_access_key_id="$s3_access_key_id" \
    s3_secret_access_key="$s3_secret_access_key" >/dev/null

  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${admin_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault kv put secret/law-eye/worker \
    database_url="$db_url" \
    redis_url="$redis_url" \
    openai_api_key="$openai_api_key" \
    openai_base_url="$openai_base_url" \
    s3_endpoint="$s3_endpoint" \
    s3_region="$s3_region" \
    s3_bucket="$s3_bucket" \
    s3_access_key_id="$s3_access_key_id" \
    s3_secret_access_key="$s3_secret_access_key" >/dev/null
}

main() {
  require_bin docker
  resolve_python
  require_bin openssl

  ensure_tls
  ensure_secrets_files
  compose_up_vault
  wait_vault_ready
  init_and_unseal
  configure_vault
  seed_secrets

  echo "[vault] ok:"
  echo "  state:       ${VAULT_STATE_DIR}"
  echo "  secrets:     ${SECRETS_DIR}"
  echo "  vault addr:  ${VAULT_ADDR}"
}

main "$@"
