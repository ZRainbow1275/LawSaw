#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/no-dockerhub/e2e.sh [--name <stack-name>] [--keep] [--rebuild] [--skip-monkey] [--skip-reports-fk-check] [--web-mode <dev|prod>]

This script:
  1) Starts a local RSS fixture server (WSL) for deterministic ingest tests
  2) Starts the full stack via scripts/no-dockerhub/start-stack.sh (no DockerHub)
  3) Runs Playwright E2E tests (apps/web)
  4) Runs Monkey tests (API/Web) with SLA thresholds (unless --skip-monkey)
  5) Stops the stack and cleans up (unless --keep)

Options:
  --name <stack-name>  Stack identifier (default: law-eye-e2e-<timestamp>)
  --keep               Keep stack + fixture server running for debugging
  --rebuild            Rebuild local helper images (redis/postgres+pgvector)
  --skip-monkey        Skip monkey tests (faster local iteration)
  --skip-reports-fk-check
                       Skip reports tenant FK regression check
  --web-mode <mode>    Web runtime mode: dev (next dev) or prod (next start). If omitted:
                       - defaults to prod when monkey is enabled (more stable)
                       - defaults to dev when --skip-monkey is used (faster)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_E2E_ENV_FILE="$ROOT/tmp/e2e-env.json"

STACK_NAME="law-eye-e2e-$(date +%Y%m%d%H%M%S)-$RANDOM"
KEEP=0
REBUILD=0
RUN_MONKEY=1
RUN_REPORTS_FK_CHECK=1
WEB_MODE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      STACK_NAME="${2:-}"
      shift 2
      ;;
    --keep)
      KEEP=1
      shift
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    --skip-monkey)
      RUN_MONKEY=0
      shift
      ;;
    --skip-reports-fk-check)
      RUN_REPORTS_FK_CHECK=0
      shift
      ;;
    --web-mode)
      WEB_MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$STACK_NAME" ]]; then
  echo "ERROR: --name must not be empty" >&2
  exit 1
fi

if [[ -z "$WEB_MODE" ]]; then
  if [[ -n "${LAW_EYE_WEB_MODE:-}" ]]; then
    WEB_MODE="${LAW_EYE_WEB_MODE}"
  elif [[ "$RUN_MONKEY" -eq 1 ]]; then
    WEB_MODE="prod"
  else
    WEB_MODE="dev"
  fi
fi
if [[ "$WEB_MODE" != "dev" && "$WEB_MODE" != "prod" ]]; then
  echo "ERROR: --web-mode must be 'dev' or 'prod' (got: $WEB_MODE)" >&2
  exit 1
fi
export LAW_EYE_WEB_MODE="$WEB_MODE"

DEFAULT_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
DEFAULT_STATE_DIR="${DEFAULT_STATE_HOME}/law-eye/no-dockerhub/${STACK_NAME}"
STATE_DIR_RAW="${LAW_EYE_NO_DOCKERHUB_STATE_DIR:-$DEFAULT_STATE_DIR}"
mkdir -p "$STATE_DIR_RAW"
STATE_DIR="$(cd "$STATE_DIR_RAW" && pwd)"
export LAW_EYE_NO_DOCKERHUB_STATE_DIR="$STATE_DIR"

LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

RSS_DIR="$ROOT/apps/web/e2e/fixtures"
RSS_FILE="$RSS_DIR/rss.xml"
if [[ ! -f "$RSS_FILE" ]]; then
  echo "ERROR: missing RSS fixture: $RSS_FILE" >&2
  exit 1
fi

ensure_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $cmd" >&2
    echo "Hint: $hint" >&2
    exit 1
  fi
}

ensure_cmd python3 "Install Python 3 (used for the RSS fixture server)."
ensure_cmd docker "Install Docker and ensure the daemon is running."

pnpm_usable_wsl() {
  pnpm -v >/dev/null 2>&1
}

pnpm_usable_windows() {
  command -v cmd.exe >/dev/null 2>&1 && cmd.exe /c pnpm -v >/dev/null 2>&1
}

PNPM_RUNNER="wsl"
if pnpm_usable_wsl; then
  PNPM_RUNNER="wsl"
elif pnpm_usable_windows; then
  PNPM_RUNNER="win"
else
  echo "ERROR: pnpm is not usable in WSL or Windows interop." >&2
  echo "Hint: Install Node.js + pnpm (either in WSL, or on Windows with WSL interop enabled)." >&2
  exit 1
fi

RSS_PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

start_rss_server() {
  local log_file="$LOG_DIR/rss.log"
  local pid_file="$PID_DIR/rss.pid"

  echo "Starting RSS fixture server on localhost:${RSS_PORT}..."
  (
    cd "$ROOT"
    nohup python3 -m http.server "$RSS_PORT" --bind 127.0.0.1 --directory "$RSS_DIR" >"$log_file" 2>&1 &
    echo "wsl:$!" >"$pid_file"
  )
}

stop_rss_server() {
  local pid_file="$PID_DIR/rss.pid"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi
  local pid_raw
  pid_raw="$(cat "$pid_file" 2>/dev/null | tr -d '\r' | tr -d '\n' || true)"
  if [[ "$pid_raw" == wsl:* ]]; then
    local pid="${pid_raw#wsl:}"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "Stopping RSS fixture server (pid=$pid)..."
      kill "$pid" >/dev/null 2>&1 || true
      for _ in $(seq 1 50); do
        if ! kill -0 "$pid" >/dev/null 2>&1; then
          break
        fi
        sleep 0.1
      done
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    fi
  fi
  rm -f "$pid_file"
}

cleanup() {
  local exit_code=$?
  if [[ "$KEEP" -eq 1 ]]; then
    echo "Keeping stack for debugging:"
    echo "  Stack: $STACK_NAME"
    echo "  State: $STATE_DIR"
    exit "$exit_code"
  fi

  # Avoid leaving behind a stale runtime file that can mislead future runs of
  # `pnpm -C apps/web e2e` into connecting to a dead port.
  rm -f "$RUNTIME_E2E_ENV_FILE" >/dev/null 2>&1 || true

  stop_rss_server || true
  bash "$ROOT/scripts/no-dockerhub/stop-stack.sh" --name "$STACK_NAME" --purge >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT

start_rss_server

START_ARGS=(--name "$STACK_NAME" --fresh)
if [[ "$REBUILD" -eq 1 ]]; then
  START_ARGS+=(--rebuild)
fi

bash "$ROOT/scripts/no-dockerhub/start-stack.sh" "${START_ARGS[@]}"

# shellcheck disable=SC1090
source "$STATE_DIR/stack.env"

run_reports_fk_check() {
  local secrets_env_file="$STATE_DIR/secrets.env"
  if [[ -f "$secrets_env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$secrets_env_file"
    set +a
  fi

  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    echo "ERROR: POSTGRES_PASSWORD is missing; cannot run reports FK regression check" >&2
    return 1
  fi

  local postgres_container=""
  postgres_container="$(
    docker compose \
      --project-name "$STACK_NAME" \
      -f "$ROOT/docker-compose.yml" \
      ps -q postgres 2>/dev/null | tr -d '\r' | tr -d '\n'
  )"

  if [[ -z "$postgres_container" ]]; then
    echo "ERROR: failed to locate postgres container for stack $STACK_NAME" >&2
    return 1
  fi

  echo "Running reports tenant FK regression check..."
  docker exec \
    -e "PGPASSWORD=${POSTGRES_PASSWORD}" \
    -i "$postgres_container" \
    psql \
      -h 127.0.0.1 \
      -U law_eye \
      -d law_eye \
      -v ON_ERROR_STOP=1 \
      -f - < "$ROOT/scripts/enterprise/reports-tenant-fk-verify.sql"
}

if [[ "$RUN_REPORTS_FK_CHECK" -eq 1 ]]; then
  run_reports_fk_check
fi

# If Web is running on Windows, force Playwright to run on Windows too.
# This keeps browser origin and NEXT_PUBLIC_API_URL loopback behavior aligned.
if [[ "${WEB_RUNS_ON_WINDOWS:-0}" == "1" ]]; then
  PNPM_RUNNER="win"
fi

export STACK_NAME
export WEB_PORT
export LAW_EYE_API_PROXY_TARGET
E2E_BASE_URL_CANDIDATE="http://127.0.0.1:${WEB_PORT}"
if [[ "${WEB_RUNS_ON_WINDOWS:-0}" == "1" ]] \
  && [[ "$PNPM_RUNNER" != "win" ]] \
  && [[ -n "${WINDOWS_HOST_IP:-}" ]]; then
  if curl -fsS --max-time 2 "${E2E_BASE_URL_CANDIDATE}/login" >/dev/null 2>&1; then
    export E2E_BASE_URL="$E2E_BASE_URL_CANDIDATE"
  else
    export E2E_BASE_URL="http://${WINDOWS_HOST_IP}:${WEB_PORT}"
  fi
else
  export E2E_BASE_URL="$E2E_BASE_URL_CANDIDATE"
fi
# RSS is fetched by API/worker inside WSL; default to a WSL-local address.
E2E_RSS_HOST="${LAW_EYE_E2E_RSS_HOST:-127.0.0.1}"
export E2E_RSS_URL="http://${E2E_RSS_HOST}:${RSS_PORT}/rss.xml"

E2E_ENV_FILE="$RUNTIME_E2E_ENV_FILE"
python3 - "$E2E_ENV_FILE" <<'PY'
import json
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
data = {
  "stack_name": os.environ.get("STACK_NAME"),
  "web_port": int(os.environ["WEB_PORT"]),
  "base_url": os.environ["E2E_BASE_URL"],
  "rss_url": os.environ["E2E_RSS_URL"],
  "api_proxy_target": os.environ.get("LAW_EYE_API_PROXY_TARGET"),
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "E2E config: runner=${PNPM_RUNNER} base_url=${E2E_BASE_URL} web_runs_on_windows=${WEB_RUNS_ON_WINDOWS:-0}"
echo "Running Playwright E2E..."
if [[ "$PNPM_RUNNER" == "win" ]]; then
  ensure_cmd cmd.exe "WSL must have Windows interop enabled (cmd.exe available)."
  ensure_cmd wslpath "WSL must provide wslpath for path conversion."
  WEB_DIR_WIN="$(wslpath -w "$ROOT/apps/web" | tr -d '\r')"
  # NOTE: Avoid nested quoting here. In some WSL+cmd.exe interop setups, quoting the
  # `cd` path inside `/c "..."` triggers `文件名、目录名或卷标语法不正确`.
  cmd.exe /c "cd /d ${WEB_DIR_WIN} && pnpm e2e"
else
  (
    cd "$ROOT"
    pnpm -C apps/web e2e
  )
fi

if [[ "$RUN_MONKEY" -eq 1 ]]; then
  mkdir -p "$ROOT/prompts/logs"

  API_BASE_URL="http://127.0.0.1:${API_PORT}"
  WEB_BASE_URL="http://127.0.0.1:${WEB_PORT}"
  if [[ "${WEB_RUNS_ON_WINDOWS:-0}" == "1" ]] && [[ -n "${WINDOWS_HOST_IP:-}" ]]; then
    WEB_BASE_URL="http://${WINDOWS_HOST_IP}:${WEB_PORT}"
  fi

  API_REPORT="$LOG_DIR/monkey_api_report.json"
  WEB_REPORT="$LOG_DIR/monkey_web_report.json"

  echo "Running Monkey (API)..."
  python3 "$ROOT/scripts/monkey/api_monkey.py" \
    --base-url "$API_BASE_URL" \
    --requests 300 \
    --concurrency 24 \
    --timeout-ms 3000 \
    --p95-threshold-ms 200 \
    --max-5xx 0 \
    --max-net-errors 0 \
    --max-timeouts 0 \
    --report-json "$API_REPORT" \
    | tee "$LOG_DIR/monkey_api.log" "$ROOT/prompts/logs/monkey_api.log"
  cp -f "$API_REPORT" "$ROOT/prompts/logs/monkey_api_report.json"

  echo "Running Monkey (Web)..."
  if [[ "${WEB_RUNS_ON_WINDOWS:-0}" == "1" ]]; then
    ensure_cmd cmd.exe "WSL must have Windows interop enabled (cmd.exe available)."
    ensure_cmd wslpath "WSL must provide wslpath for path conversion."
    WEB_MONKEY_WIN="$(wslpath -w "$ROOT/scripts/monkey/web_monkey.py" | tr -d '\r')"
    WEB_REPORT_WIN="$(wslpath -w "$WEB_REPORT" | tr -d '\r')"
    cmd.exe /c python "$WEB_MONKEY_WIN" \
      --base-url "http://127.0.0.1:${WEB_PORT}" \
      --requests 200 \
      --concurrency 16 \
      --timeout-ms 3000 \
      --p95-threshold-ms 200 \
      --max-5xx 0 \
      --max-net-errors 0 \
      --max-timeouts 0 \
      --report-json "$WEB_REPORT_WIN" \
      | tee "$LOG_DIR/monkey_web.log" "$ROOT/prompts/logs/monkey_web.log"
  else
    python3 "$ROOT/scripts/monkey/web_monkey.py" \
      --base-url "$WEB_BASE_URL" \
      --requests 200 \
      --concurrency 16 \
      --timeout-ms 3000 \
      --p95-threshold-ms 200 \
      --max-5xx 0 \
      --max-net-errors 0 \
      --max-timeouts 0 \
      --report-json "$WEB_REPORT" \
      | tee "$LOG_DIR/monkey_web.log" "$ROOT/prompts/logs/monkey_web.log"
  fi
  cp -f "$WEB_REPORT" "$ROOT/prompts/logs/monkey_web_report.json"
fi
