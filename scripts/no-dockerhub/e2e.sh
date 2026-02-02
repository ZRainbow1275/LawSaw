#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/no-dockerhub/e2e.sh [--name <stack-name>] [--keep] [--rebuild] [--skip-monkey] [--web-mode <dev|prod>]

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
  --web-mode <mode>    Web runtime mode: dev (next dev) or prod (next start). If omitted:
                       - defaults to prod when monkey is enabled (more stable)
                       - defaults to dev when --skip-monkey is used (faster)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

STACK_NAME="law-eye-e2e-$(date +%Y%m%d%H%M%S)-$RANDOM"
KEEP=0
REBUILD=0
RUN_MONKEY=1
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

STATE_DIR="$ROOT/tmp/no-dockerhub/$STACK_NAME"
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

  stop_rss_server || true
  bash "$ROOT/scripts/no-dockerhub/stop-stack.sh" --name "$STACK_NAME" --purge >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT

ENV_FILE="$STATE_DIR/.env.e2e"
python3 - "$ENV_FILE" <<'PY'
import secrets
import sys
from pathlib import Path

path = Path(sys.argv[1])
password = secrets.token_urlsafe(24)
path.write_text(f"POSTGRES_PASSWORD={password}\n", encoding="utf-8")
PY

start_rss_server

START_ARGS=(--name "$STACK_NAME" --env-file "$ENV_FILE" --fresh)
if [[ "$REBUILD" -eq 1 ]]; then
  START_ARGS+=(--rebuild)
fi

bash "$ROOT/scripts/no-dockerhub/start-stack.sh" "${START_ARGS[@]}"

# shellcheck disable=SC1090
source "$STATE_DIR/stack.env"

export STACK_NAME
export WEB_PORT
export LAW_EYE_API_PROXY_TARGET
export E2E_BASE_URL="http://127.0.0.1:${WEB_PORT}"
export E2E_RSS_URL="http://127.0.0.1:${RSS_PORT}/rss.xml"

E2E_ENV_FILE="$ROOT/tmp/e2e-env.json"
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
    --p95-threshold-ms 500 \
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
      --p95-threshold-ms 500 \
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
      --p95-threshold-ms 500 \
      --max-5xx 0 \
      --max-net-errors 0 \
      --max-timeouts 0 \
      --report-json "$WEB_REPORT" \
      | tee "$LOG_DIR/monkey_web.log" "$ROOT/prompts/logs/monkey_web.log"
  fi
  cp -f "$WEB_REPORT" "$ROOT/prompts/logs/monkey_web_report.json"
fi
