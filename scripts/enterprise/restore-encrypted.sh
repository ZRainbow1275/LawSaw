#!/usr/bin/env sh
set -eu

: "${LAW_EYE_RESTORE_BACKUP_FILE:?LAW_EYE_RESTORE_BACKUP_FILE is required}"
: "${LAW_EYE_BACKUP_PASSPHRASE:?LAW_EYE_BACKUP_PASSPHRASE is required}"
: "${LAW_EYE_RESTORE_CONFIRM:?LAW_EYE_RESTORE_CONFIRM is required}"

RESTORE_DB_URL="${LAW_EYE_RESTORE_DATABASE_URL:-${LAW_EYE__DATABASE__URL:-}}"
if [ -z "${RESTORE_DB_URL}" ]; then
  echo "[restore] LAW_EYE_RESTORE_DATABASE_URL or LAW_EYE__DATABASE__URL is required" >&2
  exit 1
fi

if [ ! -f "${LAW_EYE_RESTORE_BACKUP_FILE}" ]; then
  echo "[restore] backup file not found: ${LAW_EYE_RESTORE_BACKUP_FILE}" >&2
  exit 1
fi

if [ "${LAW_EYE_RESTORE_CONFIRM}" != "YES_I_UNDERSTAND_THIS_WILL_OVERWRITE_DATA" ]; then
  echo "[restore] set LAW_EYE_RESTORE_CONFIRM=YES_I_UNDERSTAND_THIS_WILL_OVERWRITE_DATA to continue" >&2
  exit 1
fi

WORK_DIR="${LAW_EYE_RESTORE_WORK_DIR:-/tmp/law-eye-restore}"
mkdir -p "${WORK_DIR}"

PLAIN_DUMP="${WORK_DIR}/$(basename "${LAW_EYE_RESTORE_BACKUP_FILE%.enc}")"
cleanup() {
  rm -f "${PLAIN_DUMP}"
}
trap cleanup EXIT INT TERM

echo "[restore] $(date -u +'%Y-%m-%dT%H:%M:%SZ') decrypting backup"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${LAW_EYE_RESTORE_BACKUP_FILE}" \
  -out "${PLAIN_DUMP}" \
  -pass "pass:${LAW_EYE_BACKUP_PASSPHRASE}"

echo "[restore] restoring database with pg_restore --clean --if-exists"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -d "${RESTORE_DB_URL}" \
  "${PLAIN_DUMP}"

echo "[restore] done"
