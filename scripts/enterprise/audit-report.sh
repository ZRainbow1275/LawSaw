#!/usr/bin/env sh
set -eu

: "${LAW_EYE__DATABASE__URL:?LAW_EYE__DATABASE__URL is required}"

OUT_DIR="${LAW_EYE_AUDIT_REPORT_DIR:-/var/reports/law-eye}"
RETENTION_DAYS="${LAW_EYE_AUDIT_REPORT_RETENTION_DAYS:-90}"
AUDIT_LOG_RETENTION_DAYS="${LAW_EYE_AUDIT_LOG_RETENTION_DAYS:-365}"
SKIP_RETENTION_PURGE="${LAW_EYE_AUDIT_REPORT_SKIP_RETENTION_PURGE:-0}"
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
),
permission_windowed AS (
  SELECT *
  FROM windowed
  WHERE action = 'users.roles.update'
),
permission_summary AS (
  SELECT
    COUNT(*)::bigint AS total_changes,
    COUNT(DISTINCT resource_id)::bigint AS target_users_affected,
    COUNT(DISTINCT user_id)::bigint AS actors_count
  FROM permission_windowed
),
permission_top_actors AS (
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'actor_user_id', actor_user_id,
        'count', cnt
      )
      ORDER BY cnt DESC, actor_user_id ASC
    ),
    '[]'::json
  ) AS actors
  FROM (
    SELECT
      COALESCE(user_id::text, 'system') AS actor_user_id,
      COUNT(*)::bigint AS cnt
    FROM permission_windowed
    GROUP BY COALESCE(user_id::text, 'system')
    ORDER BY cnt DESC, actor_user_id ASC
    LIMIT 20
  ) ranked
),
permission_recent AS (
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', id,
        'seq', seq,
        'actor_user_id', user_id,
        'target_user_id', resource_id,
        'requested_add_roles', COALESCE(new_value->'requested_add_roles', '[]'::jsonb),
        'requested_remove_roles', COALESCE(new_value->'requested_remove_roles', '[]'::jsonb),
        'after_roles', COALESCE(new_value->'roles', '[]'::jsonb),
        'ip_address', ip_address,
        'created_at', created_at
      )
      ORDER BY seq DESC
    ),
    '[]'::json
  ) AS changes
  FROM (
    SELECT
      id,
      seq,
      user_id,
      resource_id,
      new_value,
      ip_address,
      created_at
    FROM permission_windowed
    ORDER BY seq DESC
    LIMIT 50
  ) latest
)
SELECT json_build_object(
  'generated_at', NOW(),
  'window', '7d',
  'summary', row_to_json(summary),
  'top_actions', actions.top_actions,
  'permission_changes', json_build_object(
    'summary', row_to_json(permission_summary),
    'top_actors', permission_top_actors.actors,
    'recent', permission_recent.changes
  )
)
FROM
  summary,
  actions,
  permission_summary,
  permission_top_actors,
  permission_recent;
" > "$OUT_FILE"

case "$RETENTION_DAYS" in
  ''|*[!0-9]*) RETENTION_DAYS=90 ;;
esac
case "$AUDIT_LOG_RETENTION_DAYS" in
  ''|*[!0-9]*) AUDIT_LOG_RETENTION_DAYS=365 ;;
esac
case "$SKIP_RETENTION_PURGE" in
  1|true|TRUE|yes|YES) SKIP_RETENTION_PURGE=1 ;;
  *) SKIP_RETENTION_PURGE=0 ;;
esac

if [ "$SKIP_RETENTION_PURGE" = "1" ]; then
  echo "[audit-report] skip retention purge (LAW_EYE_AUDIT_REPORT_SKIP_RETENTION_PURGE=1)"
else
  find "$OUT_DIR" -type f -name 'audit-report-*.json' -mtime +"$RETENTION_DAYS" -print -delete || true

  psql "$LAW_EYE__DATABASE__URL" -v ON_ERROR_STOP=1 -c "
DELETE FROM audit_logs
WHERE created_at < NOW() - (${AUDIT_LOG_RETENTION_DAYS} || ' days')::interval;
" >/dev/null
fi

echo "[audit-report] done"
