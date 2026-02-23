#!/usr/bin/env sh
set -eu

: "${LAW_EYE_BASE_URL:?LAW_EYE_BASE_URL is required, e.g. https://law-eye.company.com}"

request_ok() {
  url="$1"
  if ! curl -fsS --max-time 10 "$url" >/dev/null; then
    echo "[verify] failed: $url" >&2
    return 1
  fi
  echo "[verify] ok: $url"
}

echo "[verify] start post-deploy checks"
request_ok "${LAW_EYE_BASE_URL}/health"
request_ok "${LAW_EYE_BASE_URL}/health/live"
request_ok "${LAW_EYE_BASE_URL}/health/ready"

if [ -n "${LAW_EYE_METRICS_TOKEN:-}" ]; then
  if curl -fsS --max-time 10 \
    -H "Authorization: Bearer ${LAW_EYE_METRICS_TOKEN}" \
    "${LAW_EYE_BASE_URL}/metrics" >/dev/null; then
    echo "[verify] ok: metrics endpoint authorized"
  else
    echo "[verify] failed: metrics endpoint with token" >&2
    exit 1
  fi
fi

if [ -n "${LAW_EYE__DATABASE__URL:-}" ]; then
  if command -v psql >/dev/null 2>&1; then
    echo "[verify] running reports tenant FK regression sql"
    psql "${LAW_EYE__DATABASE__URL}" -v ON_ERROR_STOP=1 \
      -f scripts/enterprise/reports-tenant-fk-verify.sql >/dev/null
    echo "[verify] ok: reports tenant FK regression"

    echo "[verify] checking tenant_configs optimistic-lock schema"
    tenant_config_version_col="$(psql "${LAW_EYE__DATABASE__URL}" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_configs' AND column_name = 'version';")"
    if [ "${tenant_config_version_col}" != "1" ]; then
      echo "[verify] failed: tenant_configs.version column not found" >&2
      exit 1
    fi

    invalid_tenant_config_versions="$(psql "${LAW_EYE__DATABASE__URL}" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM tenant_configs WHERE version < 1;")"
    if [ "${invalid_tenant_config_versions}" != "0" ]; then
      echo "[verify] failed: tenant_configs has invalid version rows (${invalid_tenant_config_versions})" >&2
      exit 1
    fi
    echo "[verify] ok: tenant_configs versioning schema"

    plaintext_feedbacks="$(psql "${LAW_EYE__DATABASE__URL}" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM feedbacks WHERE deleted_at IS NULL AND encryption_version = 0;")"
    echo "[verify] feedback plaintext rows: ${plaintext_feedbacks}"
    if [ "${LAW_EYE__ENCRYPTION__FEEDBACKS__ENABLED:-false}" = "true" ] && [ "${plaintext_feedbacks}" != "0" ]; then
      echo "[verify] failed: feedback encryption enabled but plaintext rows remain (${plaintext_feedbacks})" >&2
      exit 1
    fi
    echo "[verify] ok: feedback encryption posture"

    if [ -x scripts/enterprise/audit-report.sh ]; then
      audit_tmp_dir="${LAW_EYE_AUDIT_REPORT_DIR:-/tmp/law-eye-post-deploy-audit}"
      mkdir -p "${audit_tmp_dir}"
      echo "[verify] generating audit report sample"
      LAW_EYE_AUDIT_REPORT_DIR="${audit_tmp_dir}" \
      LAW_EYE_AUDIT_LOG_RETENTION_DAYS="${LAW_EYE_AUDIT_LOG_RETENTION_DAYS:-999999}" \
      LAW_EYE_AUDIT_REPORT_SKIP_RETENTION_PURGE=1 \
      LAW_EYE__DATABASE__URL="${LAW_EYE__DATABASE__URL}" \
      sh scripts/enterprise/audit-report.sh >/dev/null

      latest_audit_report="$(ls -1t "${audit_tmp_dir}"/audit-report-*.json 2>/dev/null | head -n 1 || true)"
      if [ -z "${latest_audit_report}" ] || [ ! -s "${latest_audit_report}" ]; then
        echo "[verify] failed: audit report file missing or empty" >&2
        exit 1
      fi
      if ! grep -F "\"permission_changes\"" "${latest_audit_report}" >/dev/null 2>&1; then
        echo "[verify] failed: audit report missing permission_changes section" >&2
        exit 1
      fi
      if ! grep -F "\"top_actors\"" "${latest_audit_report}" >/dev/null 2>&1; then
        echo "[verify] failed: audit report missing permission_changes.top_actors" >&2
        exit 1
      fi
      echo "[verify] ok: audit report schema (permission changes) -> ${latest_audit_report}"
    else
      echo "[verify] skip: scripts/enterprise/audit-report.sh is not executable"
    fi
  else
    echo "[verify] skip: psql not found, database regression checks were not executed"
  fi
else
  echo "[verify] skip: LAW_EYE__DATABASE__URL is not set"
fi

echo "[verify] completed"
