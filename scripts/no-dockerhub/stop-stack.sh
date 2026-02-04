#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/no-dockerhub/stop-stack.sh [--name <stack-name>] [--purge]

Options:
  --name <stack-name>  Stack identifier used for container names/state dir (default: law-eye-local)
  --purge              Also remove the postgres+redis+minio data volumes for this stack
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

STACK_NAME="${LAW_EYE_STACK_NAME:-law-eye-local}"
PURGE=0

safe_unlink() {
  python3 - "$1" <<'PY'
import os
import sys

path = sys.argv[1]
try:
  os.remove(path)
except FileNotFoundError:
  pass
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      STACK_NAME="${2:-}"
      shift 2
      ;;
    --purge)
      PURGE=1
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

DEFAULT_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
DEFAULT_STATE_DIR="${DEFAULT_STATE_HOME}/law-eye/no-dockerhub/${STACK_NAME}"
LEGACY_STATE_DIR="$ROOT/tmp/no-dockerhub/$STACK_NAME"

STATE_DIR_RAW="${LAW_EYE_NO_DOCKERHUB_STATE_DIR:-$DEFAULT_STATE_DIR}"
if [[ -z "${LAW_EYE_NO_DOCKERHUB_STATE_DIR:-}" && ! -d "$STATE_DIR_RAW" && -d "$LEGACY_STATE_DIR" ]]; then
  echo "WARN: falling back to legacy repo-workspace state dir for stop: $LEGACY_STATE_DIR" >&2
  STATE_DIR_RAW="$LEGACY_STATE_DIR"
fi

STATE_DIR="$STATE_DIR_RAW"
PID_DIR="$STATE_DIR/pids"

pid_exists() {
  local pid="$1"

  pid="$(echo "$pid" | tr -d '\r' | tr -d '\n')"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  if [[ "$pid" == wsl:* ]]; then
    kill -0 "${pid#wsl:}" >/dev/null 2>&1
    return $?
  fi

  if [[ "$pid" == win:* ]]; then
    local win_pid="${pid#win:}"
    if [[ -z "$win_pid" ]]; then
      return 1
    fi
    if command -v tasklist.exe >/dev/null 2>&1; then
      tasklist.exe /FI "PID eq $win_pid" 2>/dev/null | tr -d '\r' | grep -q " $win_pid " && return 0
    fi
    return 1
  fi

  # Safety default: unknown format is treated as WSL PID.
  kill -0 "$pid" >/dev/null 2>&1
}

kill_pid_tree_windows() {
  local pid="$1"
  if command -v taskkill.exe >/dev/null 2>&1; then
    taskkill.exe /PID "$pid" /T /F >/dev/null 2>&1 || true
  fi
}

resolve_pid() {
  local pid="$1"
  pid="$(echo "$pid" | tr -d '\r' | tr -d '\n')"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  if [[ "$pid" == wsl:* ]]; then
    echo "wsl ${pid#wsl:}"
    return 0
  fi
  if [[ "$pid" == win:* ]]; then
    echo "win ${pid#win:}"
    return 0
  fi

  # Back-compat: try to disambiguate plain numeric PID.
  local wsl_ok=0
  local win_ok=0
  if kill -0 "$pid" >/dev/null 2>&1; then
    wsl_ok=1
  fi
  if command -v tasklist.exe >/dev/null 2>&1; then
    if tasklist.exe /FI "PID eq $pid" 2>/dev/null | tr -d '\r' | grep -q " $pid "; then
      win_ok=1
    fi
  fi

  if [[ "$wsl_ok" -eq 1 && "$win_ok" -eq 1 ]]; then
    return 2
  fi
  if [[ "$wsl_ok" -eq 1 ]]; then
    echo "wsl $pid"
    return 0
  fi
  if [[ "$win_ok" -eq 1 ]]; then
    echo "win $pid"
    return 0
  fi
  return 1
}

stop_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid_raw
  pid_raw="$(cat "$pid_file" 2>/dev/null || true)"

  local resolved
  local resolve_rc=0
  resolved="$(resolve_pid "$pid_raw")" || resolve_rc=$?

  if [[ "$resolve_rc" -eq 1 ]]; then
    safe_unlink "$pid_file"
    return 0
  fi
  if [[ "$resolve_rc" -eq 2 ]]; then
    echo "WARN: $name pid=$pid_raw exists in both WSL and Windows; refusing to stop to avoid killing the wrong process." >&2
    return 1
  fi

  local kind
  local pid
  kind="$(echo "$resolved" | awk '{print $1}')"
  pid="$(echo "$resolved" | awk '{print $2}')"

  if [[ "$kind" == "wsl" ]]; then
    echo "Stopping $name (wsl pid=$pid)..."
    kill "$pid" >/dev/null 2>&1 || true

    for _ in $(seq 1 50); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 0.1
    done

    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "Force killing $name (wsl pid=$pid)..."
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "Force killing Windows process tree for $name (win pid=$pid)..."
    kill_pid_tree_windows "$pid"
  fi

  safe_unlink "$pid_file"
}

stop_pid web
stop_pid worker
stop_pid api

# Fallback: if web PID is missing but stack.env has WEB_PORT, stop by port (Windows-only).
STACK_ENV="$STATE_DIR/stack.env"
if [[ ! -f "$PID_DIR/web.pid" ]] && [[ -f "$STACK_ENV" ]] && command -v powershell.exe >/dev/null 2>&1; then
  web_port="$(grep '^WEB_PORT=' "$STACK_ENV" 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '\r' | tr -d '\n')"
  if [[ -n "$web_port" ]]; then
    win_pid="$(powershell.exe -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort $web_port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess" 2>/dev/null | tr -d '\r' | tr -d '\n' || true)"
    if [[ -n "$win_pid" ]]; then
      proc_name="$(powershell.exe -NoProfile -Command "try { (Get-Process -Id $win_pid).ProcessName } catch { '' }" 2>/dev/null | tr -d '\r' | tr -d '\n' || true)"
      if [[ "$proc_name" == "node" ]]; then
        echo "Stopping web by port $web_port (win pid=$win_pid)..."
        kill_pid_tree_windows "$win_pid"
      else
        echo "WARN: port $web_port is owned by pid=$win_pid ($proc_name); refusing to kill." >&2
      fi
    fi
  fi
fi

POSTGRES_CONTAINER="${STACK_NAME}-postgres"
REDIS_CONTAINER="${STACK_NAME}-redis"
MINIO_CONTAINER="${STACK_NAME}-minio"
POSTGRES_VOLUME="${STACK_NAME}-postgres-data"
REDIS_VOLUME="${STACK_NAME}-redis-data"
MINIO_VOLUME="${STACK_NAME}-minio-data"

echo "Stopping containers..."
docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
docker rm -f "$MINIO_CONTAINER" >/dev/null 2>&1 || true

if [[ "$PURGE" -eq 1 ]]; then
  echo "Removing volume: $POSTGRES_VOLUME"
  docker volume rm -f "$POSTGRES_VOLUME" >/dev/null 2>&1 || true
  echo "Removing volume: $REDIS_VOLUME"
  docker volume rm -f "$REDIS_VOLUME" >/dev/null 2>&1 || true
  echo "Removing volume: $MINIO_VOLUME"
  docker volume rm -f "$MINIO_VOLUME" >/dev/null 2>&1 || true
fi

echo "Done."
