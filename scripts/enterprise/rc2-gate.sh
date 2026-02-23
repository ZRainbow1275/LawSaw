#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  LAW_EYE_BASE_URL=http://<api-host>:<api-port> \
  LAW_EYE_WEB_URL=http://<web-host>:<web-port> \
  LAW_EYE_ORIGIN=http://<web-origin-host>:<web-port> \
  LAW_EYE_WORKER_HEALTH_URL=http://<worker-host>:<worker-port> \
  LAW_EYE__DATABASE__URL=postgres://... \
  bash scripts/enterprise/rc2-gate.sh

Optional env:
  LAW_EYE_CORE_E2E_ROUNDS                default: 3
  LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING     default: 1
  LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS     default: 800
  LAW_EYE_RUN_WEB_E2E                    default: 1
  LAW_EYE_RUN_WEB_TEST                   default: 1
  LAW_EYE_RUN_CARGO_CHECK                default: 1
  LAW_EYE_RUN_POST_DEPLOY_VERIFY         default: 1
  LAW_EYE_RC2_REPORT_DIR                 default: tmp/rc2-gate-<timestamp>
EOF
}

flag_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

require_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "[rc2] missing required env: ${key}" >&2
    usage >&2
    exit 1
  fi
}

http_status() {
  local url="$1"
  curl -sS -o /dev/null -w "%{http_code}" "$url"
}

expect_status_one_of() {
  local value="$1"
  shift
  local expected
  for expected in "$@"; do
    if [[ "$value" == "$expected" ]]; then
      return 0
    fi
  done
  return 1
}

run_gate() {
  local name="$1"
  shift
  echo "[rc2] gate start: ${name}"
  if "$@"; then
    echo "[rc2] gate ok: ${name}"
  else
    echo "[rc2] gate failed: ${name}" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

require_env "LAW_EYE_BASE_URL"
require_env "LAW_EYE_WEB_URL"
require_env "LAW_EYE_WORKER_HEALTH_URL"
require_env "LAW_EYE__DATABASE__URL"

LAW_EYE_ORIGIN="${LAW_EYE_ORIGIN:-$LAW_EYE_WEB_URL}"
LAW_EYE_CORE_E2E_ROUNDS="${LAW_EYE_CORE_E2E_ROUNDS:-3}"
LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING="${LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING:-1}"
LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS="${LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS:-800}"
LAW_EYE_RUN_WEB_E2E="${LAW_EYE_RUN_WEB_E2E:-1}"
LAW_EYE_RUN_WEB_TEST="${LAW_EYE_RUN_WEB_TEST:-1}"
LAW_EYE_RUN_CARGO_CHECK="${LAW_EYE_RUN_CARGO_CHECK:-1}"
LAW_EYE_RUN_POST_DEPLOY_VERIFY="${LAW_EYE_RUN_POST_DEPLOY_VERIFY:-1}"

case "$LAW_EYE_CORE_E2E_ROUNDS" in
  ''|*[!0-9]*)
    echo "[rc2] invalid LAW_EYE_CORE_E2E_ROUNDS=${LAW_EYE_CORE_E2E_ROUNDS}" >&2
    exit 1
    ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${LAW_EYE_RC2_REPORT_DIR:-$ROOT/tmp/rc2-gate-${timestamp}}"
mkdir -p "$REPORT_DIR"
LOG_FILE="$REPORT_DIR/rc2-gate.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[rc2] start @ ${timestamp}"
echo "[rc2] report_dir=${REPORT_DIR}"
echo "[rc2] api=${LAW_EYE_BASE_URL}"
echo "[rc2] web=${LAW_EYE_WEB_URL}"
echo "[rc2] origin=${LAW_EYE_ORIGIN}"
echo "[rc2] worker=${LAW_EYE_WORKER_HEALTH_URL}"

web_login_status="$(http_status "${LAW_EYE_WEB_URL%/}/login")"
if ! expect_status_one_of "$web_login_status" 200 302 303 307 308; then
  echo "[rc2] failed: web /login status=${web_login_status}" >&2
  exit 1
fi
echo "[rc2] ok: web /login status=${web_login_status}"

web_auth_status="$(http_status "${LAW_EYE_WEB_URL%/}/api/v1/auth/me")"
if ! expect_status_one_of "$web_auth_status" 200 401; then
  echo "[rc2] failed: web /api/v1/auth/me status=${web_auth_status}" >&2
  exit 1
fi
echo "[rc2] ok: web /api/v1/auth/me status=${web_auth_status}"

run_gate "api_health" curl -fsS --max-time 10 "${LAW_EYE_BASE_URL%/}/health"
run_gate "api_live" curl -fsS --max-time 10 "${LAW_EYE_BASE_URL%/}/health/live"
run_gate "api_ready" curl -fsS --max-time 10 "${LAW_EYE_BASE_URL%/}/health/ready"
run_gate "worker_health" curl -fsS --max-time 10 "${LAW_EYE_WORKER_HEALTH_URL%/}/health"

if flag_enabled "$LAW_EYE_RUN_CARGO_CHECK"; then
  run_gate "cargo_check_api_worker" cargo check -p law-eye-api -p law-eye-worker
fi

if flag_enabled "$LAW_EYE_RUN_WEB_TEST"; then
  run_gate "web_test" pnpm -C apps/web test
fi

if flag_enabled "$LAW_EYE_RUN_WEB_E2E"; then
  run_gate "web_e2e" pnpm -C apps/web e2e
fi

if [[ "$LAW_EYE_CORE_E2E_ROUNDS" -gt 0 ]]; then
  for i in $(seq 1 "$LAW_EYE_CORE_E2E_ROUNDS"); do
    report_file="$REPORT_DIR/core-e2e-round${i}.json"
    echo "[rc2] gate start: core_e2e_round_${i}"
    if node tmp/core-e2e-local.mjs \
      --base-url "$LAW_EYE_BASE_URL" \
      --origin "$LAW_EYE_ORIGIN" \
      --assert-knowledge-embedding "$LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING" \
      > "$report_file"; then
      :
    else
      echo "[rc2] gate failed: core_e2e_round_${i}" >&2
      exit 1
    fi
    if ! grep -E '"ok"[[:space:]]*:[[:space:]]*true' "$report_file" >/dev/null 2>&1; then
      echo "[rc2] gate failed: core_e2e_round_${i} (ok!=true)" >&2
      echo "[rc2] see ${report_file}" >&2
      exit 1
    fi
    echo "[rc2] gate ok: core_e2e_round_${i} -> ${report_file}"
  done
fi

if flag_enabled "$LAW_EYE_RUN_POST_DEPLOY_VERIFY"; then
  run_gate "post_deploy_verify" env \
    LAW_EYE_BASE_URL="$LAW_EYE_BASE_URL" \
    LAW_EYE_WORKER_HEALTH_URL="$LAW_EYE_WORKER_HEALTH_URL" \
    LAW_EYE__DATABASE__URL="$LAW_EYE__DATABASE__URL" \
    LAW_EYE_VERIFY_DB_QUERY_PLAN=1 \
    LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS="$LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS" \
    sh scripts/enterprise/post-deploy-verify.sh
fi

SUMMARY_FILE="$REPORT_DIR/summary.txt"
{
  echo "RC2_GATE=PASS"
  echo "timestamp_utc=${timestamp}"
  echo "api=${LAW_EYE_BASE_URL}"
  echo "web=${LAW_EYE_WEB_URL}"
  echo "origin=${LAW_EYE_ORIGIN}"
  echo "worker=${LAW_EYE_WORKER_HEALTH_URL}"
  echo "core_e2e_rounds=${LAW_EYE_CORE_E2E_ROUNDS}"
  echo "assert_knowledge_embedding=${LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING}"
  echo "query_plan_threshold_ms=${LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS}"
  echo "report_dir=${REPORT_DIR}"
} > "$SUMMARY_FILE"

echo "[rc2] completed: PASS"
echo "[rc2] summary: ${SUMMARY_FILE}"
