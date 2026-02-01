#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/no-dockerhub/e2e.sh [--name <stack-name>] [--keep] [--rebuild]

This script:
  1) Starts a local RSS fixture server (WSL) for deterministic ingest tests
  2) Starts the full stack via scripts/no-dockerhub/start-stack.sh (no DockerHub)
  3) Runs Playwright E2E tests (apps/web)
  4) Stops the stack and cleans up (unless --keep)

Options:
  --name <stack-name>  Stack identifier (default: law-eye-e2e-<timestamp>)
  --keep               Keep stack + fixture server running for debugging
  --rebuild            Rebuild local helper images (redis/postgres+pgvector)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

STACK_NAME="law-eye-e2e-$(date +%Y%m%d%H%M%S)-$RANDOM"
KEEP=0
REBUILD=0

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
ensure_cmd pnpm "Install pnpm (apps/web Playwright runner)."
ensure_cmd docker "Install Docker and ensure the daemon is running."

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
(
  cd "$ROOT"
  pnpm -C apps/web e2e
)
