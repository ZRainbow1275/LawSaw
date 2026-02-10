#!/usr/bin/env sh
set -eu

: "${LAW_EYE__DATABASE__URL:?LAW_EYE__DATABASE__URL is required}"

OUT_DIR="${LAW_EYE_AUDIT_REPORT_DIR:-/var/reports/law-eye}"
RETENTION_DAYS="${LAW_EYE_AUDIT_REPORT_RETENTION_DAYS:-90}"
AUDIT_LOG_RETENTION_DAYS="${LAW_EYE_AUDIT_LOG_RETENTION_DAYS:-365}"
TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
OUT_FILE="${OUT_DIR}/audit-report-${TIMESTAMP}.json"

mkdir -p "$OUT_DIR"

echo "[audit-report] generating ${OUT_FILE}"
psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -Atc "
WITH windowed AS (
  SELECT *
  FROM audit_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
),
summary AS (
  SELECT
    COUNT(*)::bigint AS total_events,
    COUNT(*) FILTER (WHERE action LIKE 'auth.%')::bigint AS auth_events,
    COUNT(*) FILTER (WHERE action LIKE 'db.%')::bigint AS db_events,
    COUNT(*) FILTER (WHERE action LIKE 'objects.%')::bigint AS object_events,
    MIN(created_at) AS window_start,
    MAX(created_at) AS window_end
  FROM windowed
),
actions AS (
  SELECT COALESCE(
    json_agg(json_build_object('action', action, 'count', cnt) ORDER BY cnt DESC),
    '[]'::json
  ) AS top_actions
  FROM (
    SELECT action, COUNT(*)::bigint AS cnt
    FROM windowed
    GROUP BY action
    ORDER BY cnt DESC
    LIMIT 20
  ) ranked
)
SELECT json_build_object(
  'generated_at', NOW(),
  'window', '7d',
  'summary', row_to_json(summary),
  'top_actions', actions.top_actions
)
FROM summary, actions;
" > "$OUT_FILE"

case "$RETENTION_DAYS" in
  ''|*[!0-9]*) RETENTION_DAYS=90 ;;
esac
case "$AUDIT_LOG_RETENTION_DAYS" in
  ''|*[!0-9]*) AUDIT_LOG_RETENTION_DAYS=365 ;;
esac

find "$OUT_DIR" -type f -name 'audit-report-*.json' -mtime +"$RETENTION_DAYS" -print -delete || true

psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -c "
DELETE FROM audit_logs
WHERE created_at < NOW() - (${AUDIT_LOG_RETENTION_DAYS} || ' days')::interval;
" >/dev/null

echo "[audit-report] done"
