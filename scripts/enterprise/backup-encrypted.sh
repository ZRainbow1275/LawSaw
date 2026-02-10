#!/usr/bin/env sh
set -eu

: "${LAW_EYE__DATABASE__URL:?LAW_EYE__DATABASE__URL is required}"
: "${LAW_EYE_BACKUP_PASSPHRASE:?LAW_EYE_BACKUP_PASSPHRASE is required}"

OUT_DIR="${LAW_EYE_BACKUP_DIR:-/var/backups/law-eye}"
RETENTION_DAYS="${LAW_EYE_BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
PLAIN_FILE="${OUT_DIR}/postgres-${TIMESTAMP}.dump"
ENC_FILE="${PLAIN_FILE}.enc"

mkdir -p "$OUT_DIR"

echo "[backup] $(date -u +'%Y-%m-%dT%H:%M:%SZ') creating pg_dump"
pg_dump "$LAW_EYE__DATABASE__URL" -Fc -f "$PLAIN_FILE"

echo "[backup] encrypting dump -> ${ENC_FILE}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$PLAIN_FILE" \
  -out "$ENC_FILE" \
  -pass "pass:${LAW_EYE_BACKUP_PASSPHRASE}"

rm -f "$PLAIN_FILE"

case "$RETENTION_DAYS" in
  ''|*[!0-9]*)
    echo "[backup] invalid LAW_EYE_BACKUP_RETENTION_DAYS=${RETENTION_DAYS}" >&2
    RETENTION_DAYS=30
    ;;
esac

find "$OUT_DIR" -type f -name '*.dump.enc' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[backup] done: ${ENC_FILE}"
