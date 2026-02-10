#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROTATE_SCRIPT="${SCRIPT_DIR}/vault-rotate.sh"
INTERVAL_SECONDS="${LAW_EYE_VAULT_ROTATE_INTERVAL_SECONDS:-2592000}"

if ! command -v sh >/dev/null 2>&1; then
  echo "[vault-rotate-cron] shell runtime unavailable" >&2
  exit 1
fi

if [ ! -f "$ROTATE_SCRIPT" ]; then
  echo "[vault-rotate-cron] missing rotate script: $ROTATE_SCRIPT" >&2
  exit 1
fi

case "$INTERVAL_SECONDS" in
  ''|*[!0-9]*)
    echo "[vault-rotate-cron] invalid LAW_EYE_VAULT_ROTATE_INTERVAL_SECONDS: $INTERVAL_SECONDS" >&2
    exit 1
    ;;
esac

if [ "$INTERVAL_SECONDS" -lt 60 ]; then
  echo "[vault-rotate-cron] interval too small; must be >= 60s" >&2
  exit 1
fi

while true; do
  echo "[vault-rotate-cron] $(date -u +'%Y-%m-%dT%H:%M:%SZ') rotation started"
  if sh "$ROTATE_SCRIPT"; then
    echo "[vault-rotate-cron] $(date -u +'%Y-%m-%dT%H:%M:%SZ') rotation succeeded"
  else
    echo "[vault-rotate-cron] $(date -u +'%Y-%m-%dT%H:%M:%SZ') rotation failed" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
