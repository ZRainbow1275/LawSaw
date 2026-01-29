#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

VAULT_CONTAINER="law-eye-vault"
VAULT_ADDR="https://127.0.0.1:8200"
VAULT_STATE_DIR="${ROOT_DIR}/tmp/enterprise/vault"
ROOT_TOKEN_FILE="${VAULT_STATE_DIR}/root.token"

usage() {
  echo "Usage: $0 <api|worker>" >&2
  exit 2
}

docker_exec() {
  MSYS2_ARG_CONV_EXCL='*' docker exec "$@"
}

main() {
  local target="${1:-}"
  case "$target" in
    api|worker) ;;
    *) usage ;;
  esac

  if [[ ! -f "$ROOT_TOKEN_FILE" ]]; then
    echo "[revoke] missing root token file: $ROOT_TOKEN_FILE" >&2
    exit 1
  fi

  local root_token
  root_token="$(cat "$ROOT_TOKEN_FILE")"

  echo "[revoke] revoking $target client certificate mapping..."
  docker_exec \
    -e "VAULT_ADDR=${VAULT_ADDR}" \
    -e "VAULT_TOKEN=${root_token}" \
    -e "VAULT_CACERT=/vault/tls/ca.crt" \
    -e "VAULT_CLIENT_CERT=/vault/tls/vault-bootstrap-client.crt" \
    -e "VAULT_CLIENT_KEY=/vault/tls/vault-bootstrap-client.key" \
    "$VAULT_CONTAINER" vault delete "auth/cert/certs/law-eye-${target}" >/dev/null

  echo "[revoke] ok"
}

main "$@"
