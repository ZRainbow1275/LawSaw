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
  else
    echo "[verify] skip: psql not found, database regression checks were not executed"
  fi
else
  echo "[verify] skip: LAW_EYE__DATABASE__URL is not set"
fi

echo "[verify] completed"
