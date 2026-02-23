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

flag_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

run_query_plan_gate() {
  gate_name="$1"
  gate_sql="$2"
  gate_threshold_ms="$3"
  gate_output_dir="$4"
  gate_disallow_seq_scan="$5"

  plan_file="${gate_output_dir}/query-plan-${gate_name}.txt"
  if ! psql "${LAW_EYE__DATABASE__URL}" -v ON_ERROR_STOP=1 -X \
    -c "EXPLAIN (ANALYZE, BUFFERS) ${gate_sql}" >"${plan_file}"; then
    echo "[verify] failed: query-plan gate ${gate_name} (psql explain failed)" >&2
    exit 1
  fi

  execution_ms="$(awk '/Execution Time:/ {print $(NF-1)}' "${plan_file}" | tail -n 1)"
  planning_ms="$(awk '/Planning Time:/ {print $(NF-1)}' "${plan_file}" | tail -n 1)"

  if [ -z "${execution_ms}" ]; then
    echo "[verify] failed: query-plan gate ${gate_name} missing execution time" >&2
    exit 1
  fi
  case "${execution_ms}" in
    ''|*[!0-9.]*) echo "[verify] failed: query-plan gate ${gate_name} invalid execution time (${execution_ms})" >&2; exit 1 ;;
  esac
  if [ -n "${planning_ms}" ]; then
    case "${planning_ms}" in
      ''|*[!0-9.]*) planning_ms="0" ;;
    esac
  else
    planning_ms="0"
  fi

  if ! awk -v value="${execution_ms}" -v max="${gate_threshold_ms}" 'BEGIN { exit(value <= max ? 0 : 1) }'; then
    echo "[verify] failed: query-plan gate ${gate_name} execution ${execution_ms}ms > ${gate_threshold_ms}ms" >&2
    echo "[verify] see plan: ${plan_file}" >&2
    exit 1
  fi

  if flag_enabled "${gate_disallow_seq_scan}" \
    && grep -E "(^|[[:space:]])Seq Scan on " "${plan_file}" >/dev/null 2>&1; then
    echo "[verify] failed: query-plan gate ${gate_name} contains sequential scan" >&2
    echo "[verify] see plan: ${plan_file}" >&2
    exit 1
  fi

  printf '%s,%s,%s,%s\n' "${gate_name}" "${planning_ms}" "${execution_ms}" "${plan_file}" >> "${gate_output_dir}/summary.csv"
  echo "[verify] ok: query-plan gate ${gate_name} (execution_ms=${execution_ms}, threshold_ms=${gate_threshold_ms})"
}

run_query_plan_baseline() {
  if ! flag_enabled "${LAW_EYE_VERIFY_DB_QUERY_PLAN:-0}"; then
    return 0
  fi

  gate_output_dir="${LAW_EYE_DB_QUERY_PLAN_REPORT_DIR:-/tmp/law-eye-post-deploy-query-plan}"
  mkdir -p "${gate_output_dir}"
  printf 'query,planning_ms,execution_ms,plan_file\n' > "${gate_output_dir}/summary.csv"

  gate_threshold_ms="${LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS:-250}"
  case "${gate_threshold_ms}" in
    ''|*[!0-9.]*) gate_threshold_ms="250" ;;
  esac
  gate_disallow_seq_scan="${LAW_EYE_DB_QUERY_PLAN_DISALLOW_SEQ_SCAN:-0}"

  perf_tenant_id="$(psql "${LAW_EYE__DATABASE__URL}" -tA -v ON_ERROR_STOP=1 \
    -c "SELECT tenant_id::text FROM articles WHERE deleted_at IS NULL ORDER BY created_at DESC NULLS LAST LIMIT 1;")"
  perf_tenant_id="$(printf '%s' "${perf_tenant_id}" | tr -d '[:space:]')"
  if [ -z "${perf_tenant_id}" ]; then
    perf_tenant_id="$(psql "${LAW_EYE__DATABASE__URL}" -tA -v ON_ERROR_STOP=1 \
      -c "SELECT id::text FROM tenants ORDER BY created_at DESC NULLS LAST LIMIT 1;")"
    perf_tenant_id="$(printf '%s' "${perf_tenant_id}" | tr -d '[:space:]')"
  fi

  if [ -z "${perf_tenant_id}" ]; then
    echo "[verify] skip: query-plan baseline (no tenant row found)"
    return 0
  fi
  case "${perf_tenant_id}" in
    *[!0-9a-fA-F-]*)
      echo "[verify] failed: query-plan baseline invalid tenant id (${perf_tenant_id})" >&2
      exit 1
      ;;
  esac

  echo "[verify] running query-plan baseline gates (tenant=${perf_tenant_id}, threshold_ms=${gate_threshold_ms})"

  run_query_plan_gate \
    "articles_latest" \
    "SELECT id, published_at FROM articles WHERE tenant_id = '${perf_tenant_id}'::uuid AND deleted_at IS NULL ORDER BY published_at DESC NULLS LAST, id DESC LIMIT 20;" \
    "${gate_threshold_ms}" \
    "${gate_output_dir}" \
    "${gate_disallow_seq_scan}"

  run_query_plan_gate \
    "statistics_importance" \
    "SELECT importance, COUNT(*) FROM articles WHERE tenant_id = '${perf_tenant_id}'::uuid AND deleted_at IS NULL GROUP BY importance ORDER BY COUNT(*) DESC LIMIT 20;" \
    "${gate_threshold_ms}" \
    "${gate_output_dir}" \
    "${gate_disallow_seq_scan}"

  run_query_plan_gate \
    "permission_audit_latest" \
    "SELECT seq, id FROM audit_logs WHERE tenant_id = '${perf_tenant_id}'::uuid AND resource = 'users' AND action = 'users.roles.update' ORDER BY seq DESC LIMIT 50;" \
    "${gate_threshold_ms}" \
    "${gate_output_dir}" \
    "${gate_disallow_seq_scan}"

  echo "[verify] ok: query-plan baseline gates -> ${gate_output_dir}/summary.csv"
}

echo "[verify] start post-deploy checks"
request_ok "${LAW_EYE_BASE_URL}/health"
request_ok "${LAW_EYE_BASE_URL}/health/live"
request_ok "${LAW_EYE_BASE_URL}/health/ready"

if [ -n "${LAW_EYE_WORKER_HEALTH_URL:-}" ]; then
  worker_base="${LAW_EYE_WORKER_HEALTH_URL%/}"
  request_ok "${worker_base}/health"
  if [ -n "${LAW_EYE_WORKER_METRICS_TOKEN:-}" ]; then
    if curl -fsS --max-time 10 \
      -H "Authorization: Bearer ${LAW_EYE_WORKER_METRICS_TOKEN}" \
      "${worker_base}/metrics" >/dev/null; then
      echo "[verify] ok: worker metrics endpoint authorized"
    else
      echo "[verify] failed: worker metrics endpoint with token" >&2
      exit 1
    fi
  fi
fi

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

    run_query_plan_baseline
  else
    echo "[verify] skip: psql not found, database regression checks were not executed"
  fi
else
  echo "[verify] skip: LAW_EYE__DATABASE__URL is not set"
fi

echo "[verify] completed"
