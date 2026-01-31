#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/no-dockerhub/start-stack.sh [--name <stack-name>] [--env-file <path>] [--rebuild] [--fresh]

Options:
  --name <stack-name>  Stack identifier used for container names/state dir (default: law-eye-local)
  --env-file <path>    Env file containing POSTGRES_PASSWORD (default: <repo>/.env)
  --rebuild            Rebuild local helper images (redis/postgres+pgvector)
  --fresh              Remove the postgres data volume before start (DANGEROUS: wipes data)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

STACK_NAME="${LAW_EYE_STACK_NAME:-law-eye-local}"
ENV_FILE=""
REBUILD_IMAGES=0
FRESH=0
RUNNING=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      STACK_NAME="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --rebuild)
      REBUILD_IMAGES=1
      shift
      ;;
    --fresh)
      FRESH=1
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

if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT/.env"
fi

cleanup_on_exit() {
  local exit_code=$?
  if [[ "$RUNNING" -eq 1 && "$exit_code" -ne 0 ]]; then
    echo "Startup failed (exit=$exit_code). Cleaning up stack: $STACK_NAME" >&2
    bash "$ROOT/scripts/no-dockerhub/stop-stack.sh" --name "$STACK_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_exit EXIT

STATE_DIR="$ROOT/tmp/no-dockerhub/$STACK_NAME"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing env file: $ENV_FILE (POSTGRES_PASSWORD is required)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "ERROR: POSTGRES_PASSWORD is empty in $ENV_FILE" >&2
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

ensure_cmd docker "Install Docker and ensure the daemon is running."
ensure_cmd python3 "Install Python 3 (used for port probing)."
ensure_cmd curl "Install curl (used for readiness checks)."
ensure_cmd pnpm "Install pnpm (used to start apps/web)."

# In non-login shells cargo may not be on PATH. Try sourcing rustup env if present.
if ! command -v cargo >/dev/null 2>&1; then
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/.cargo/env"
  fi
fi
ensure_cmd cargo "Install Rust toolchain (rustup) and ensure cargo is on PATH."

NODE_PLATFORM="$(node -p "process.platform" 2>/dev/null | tr -d '\r' || true)"

get_primary_ipv4() {
  ip -4 addr show eth0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -n 1
}

to_windows_path() {
  local path="$1"

  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$path" | tr -d '\r'
    return 0
  fi

  if [[ "$path" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]}"
    local rest="${BASH_REMATCH[2]//\//\\}"
    printf '%s:\\%s' "${drive^^}" "$rest"
    return 0
  fi

  echo "$path"
}

port_free_wsl() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket()
try:
    s.bind(("0.0.0.0", port))
except OSError:
    sys.exit(1)
finally:
    s.close()
sys.exit(0)
PY
}

port_free_windows() {
  local port="$1"

  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >/dev/null 2>&1
    return $?
  fi

  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c "netstat -ano | findstr /R /C\":$port .*LISTENING\" >nul" >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
      return 1
    fi
    return 0
  fi

  return 0
}

port_free() {
  local port="$1"
  port_free_wsl "$port" && port_free_windows "$port"
}

choose_port() {
  local name="$1"
  shift
  for candidate in "$@"; do
    if port_free "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "ERROR: no free port candidates for $name ($*)" >&2
  return 1
}

choose_port_range() {
  local name="$1"
  local start="$2"
  local end="$3"

  local candidate
  for ((candidate = start; candidate <= end; candidate++)); do
    if port_free "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done

  echo "ERROR: no free port in range for $name ($start..$end)" >&2
  return 1
}

POSTGRES_PORT="${POSTGRES_PORT:-$(choose_port postgres 5435 5436 15435 2>/dev/null || choose_port_range postgres 15435 15550)}"
REDIS_PORT="${REDIS_PORT:-$(choose_port redis 6380 6381 16380 16381 2>/dev/null || choose_port_range redis 16380 16450)}"
API_PORT="${API_PORT:-$(choose_port api 3001 3003 3005 2>/dev/null || choose_port_range api 13000 13150)}"
WEB_PORT="${WEB_PORT:-$(choose_port web 8849 8850 8851 2>/dev/null || choose_port_range web 18849 18950)}"

if ! port_free "$POSTGRES_PORT"; then
  echo "ERROR: POSTGRES_PORT=$POSTGRES_PORT is not available" >&2
  exit 1
fi
if ! port_free "$REDIS_PORT"; then
  echo "ERROR: REDIS_PORT=$REDIS_PORT is not available" >&2
  exit 1
fi
if ! port_free "$API_PORT"; then
  echo "ERROR: API_PORT=$API_PORT is not available" >&2
  exit 1
fi
if ! port_free "$WEB_PORT"; then
  echo "ERROR: WEB_PORT=$WEB_PORT is not available" >&2
  exit 1
fi

echo "Stack: $STACK_NAME"
echo "Using ports: postgres=$POSTGRES_PORT redis=$REDIS_PORT api=$API_PORT web=$WEB_PORT"

image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

build_redis_image() {
  docker build -t lawsaw-redis:local - <<'EOF'
FROM mcr.microsoft.com/devcontainers/base:ubuntu
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y redis-server \
  && rm -rf /var/lib/apt/lists/*
EXPOSE 6379
CMD ["redis-server", "--appendonly", "yes", "--protected-mode", "no", "--bind", "0.0.0.0", "--port", "6379"]
EOF
}

build_postgres_image() {
  docker build -t lawsaw-postgres-pgvector:local - <<'EOF'
FROM mcr.microsoft.com/devcontainers/base:ubuntu
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y ca-certificates curl gnupg \
  && rm -rf /var/lib/apt/lists/*

# Install PostgreSQL 16 + pgvector from PGDG.
RUN set -eux; \
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg; \
  apt-get update; \
  apt-get install -y postgresql-16 postgresql-16-pgvector; \
  rm -rf /var/lib/apt/lists/*

ENV PGDATA=/var/lib/postgresql/data
RUN mkdir -p /var/lib/postgresql/data \
  && chown -R postgres:postgres /var/lib/postgresql \
  && chmod 700 /var/lib/postgresql/data

RUN cat > /usr/local/bin/docker-entrypoint.sh <<'EOS'
#!/usr/bin/env bash
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

BIN="/usr/lib/postgresql/16/bin"

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  install -d -o postgres -g postgres -m 0700 "${PGDATA}"
  su - postgres -c "${BIN}/initdb -D '${PGDATA}' --encoding=UTF8 --locale=C"

  echo "listen_addresses='*'" >> "${PGDATA}/postgresql.conf"
  echo "password_encryption='scram-sha-256'" >> "${PGDATA}/postgresql.conf"
  echo "host all all 0.0.0.0/0 scram-sha-256" >> "${PGDATA}/pg_hba.conf"
  echo "host all all ::/0 scram-sha-256" >> "${PGDATA}/pg_hba.conf"

  su - postgres -c "${BIN}/pg_ctl -D '${PGDATA}' -o \"-c listen_addresses='*'\" -w start"

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\"" | grep -q 1; then
    su - postgres -c "psql -v ON_ERROR_STOP=1 --username=postgres -c \"CREATE ROLE \\\"${POSTGRES_USER}\\\" WITH LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';\""
  fi

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\"" | grep -q 1; then
    su - postgres -c "psql -v ON_ERROR_STOP=1 --username=postgres -c \"CREATE DATABASE \\\"${POSTGRES_DB}\\\" OWNER \\\"${POSTGRES_USER}\\\";\""
  fi

  su - postgres -c "${BIN}/pg_ctl -D '${PGDATA}' -m fast -w stop"
fi

exec su - postgres -c "${BIN}/postgres -D '${PGDATA}' -c listen_addresses='*'"
EOS

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/var/lib/postgresql/data"]
EXPOSE 5432
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
EOF
}

echo "Ensuring local images exist (Docker Hub is unavailable; using MCR base image)..."

if [[ "$REBUILD_IMAGES" -eq 1 ]] || ! image_exists lawsaw-redis:local; then
  echo "Building image: lawsaw-redis:local"
  build_redis_image
else
  echo "Using existing image: lawsaw-redis:local"
fi

if [[ "$REBUILD_IMAGES" -eq 1 ]] || ! image_exists lawsaw-postgres-pgvector:local; then
  echo "Building image: lawsaw-postgres-pgvector:local"
  build_postgres_image
else
  echo "Using existing image: lawsaw-postgres-pgvector:local"
fi

POSTGRES_CONTAINER="${STACK_NAME}-postgres"
REDIS_CONTAINER="${STACK_NAME}-redis"
POSTGRES_VOLUME="${STACK_NAME}-postgres-data"

echo "Starting containers..."
docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true

if [[ "$FRESH" -eq 1 ]]; then
  echo "Wiping postgres volume: $POSTGRES_VOLUME"
  docker volume rm -f "$POSTGRES_VOLUME" >/dev/null 2>&1 || true
fi

RUNNING=1
docker run -d --name "$REDIS_CONTAINER" -p "${REDIS_PORT}:6379" lawsaw-redis:local >/dev/null
docker run -d --name "$POSTGRES_CONTAINER" \
  -p "${POSTGRES_PORT}:5432" \
  --env-file "$ENV_FILE" \
  -e POSTGRES_USER=law_eye \
  -e POSTGRES_DB=law_eye \
  -v "$POSTGRES_VOLUME":/var/lib/postgresql/data \
  lawsaw-postgres-pgvector:local >/dev/null

echo "Waiting for Redis..."
for _ in $(seq 1 60); do
  if docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then
  echo "ERROR: Redis did not become ready. See: docker logs $REDIS_CONTAINER" >&2
  exit 1
fi

echo "Waiting for Postgres..."
postgres_ready_streak=0
for _ in $(seq 1 180); do
  if docker exec "$POSTGRES_CONTAINER" su - postgres -c "pg_isready -q -p 5432" >/dev/null 2>&1; then
    postgres_ready_streak=$((postgres_ready_streak + 1))
    if [[ "$postgres_ready_streak" -ge 3 ]]; then
      break
    fi
  else
    postgres_ready_streak=0
  fi
  sleep 1
done
if [[ "$postgres_ready_streak" -lt 3 ]]; then
  echo "ERROR: Postgres did not become ready. See: docker logs $POSTGRES_CONTAINER" >&2
  exit 1
fi

urlencode() {
  python3 - "$1" <<'PY'
import sys
import urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=""))
PY
}

DB_PASS_ENC="$(urlencode "$POSTGRES_PASSWORD")"
DB_URL="postgres://law_eye:${DB_PASS_ENC}@localhost:${POSTGRES_PORT}/law_eye"
REDIS_URL="redis://localhost:${REDIS_PORT}"

# Web should call same-origin (/api/v1/*) to keep cookie auth stable under SameSite=Lax.
# Next dev server proxies to the Rust API via rewrites configured by LAW_EYE_API_PROXY_TARGET.
WSL_HOST_IP="${LAW_EYE_WSL_HOST_IP:-}"
NEXT_PUBLIC_API_URL="http://localhost:${WEB_PORT}"
LAW_EYE_API_PROXY_TARGET="http://localhost:${API_PORT}"

export LAW_EYE__DATABASE__URL="$DB_URL"
export LAW_EYE__REDIS__URL="$REDIS_URL"
export LAW_EYE__DATABASE__SESSION_ROLE="law_eye_app"
export LAW_EYE__SERVER__HOST="${LAW_EYE__SERVER__HOST:-0.0.0.0}"
export LAW_EYE__SERVER__PORT="$API_PORT"
export LAW_EYE__SERVER__ALLOWED_ORIGINS="http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}"
export WEB_PORT="$WEB_PORT"

# Avoid Windows-mounted target dir issues by placing build artifacts in the WSL filesystem.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/lawsaw-cargo-target}"
mkdir -p "$CARGO_TARGET_DIR"

start_bg() {
  local name="$1"
  local workdir="$2"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"
  shift 2

  if [[ -f "$pid_file" ]] && pid_exists "$(cat "$pid_file")"; then
    echo "Process already running: $name (pid=$(cat "$pid_file"))"
    return 0
  fi

  echo "Starting $name..."
  (
    cd "$workdir"
    nohup "$@" >"$log_file" 2>&1 &
    echo "wsl:$!" >"$pid_file"
  )
}

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

  # Safety default: treat unknown format as WSL PID.
  kill -0 "$pid" >/dev/null 2>&1
}

windows_listen_pid() {
  local port="$1"
  if ! command -v powershell.exe >/dev/null 2>&1; then
    return 1
  fi
  powershell.exe -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess" 2>/dev/null | tr -d '\r' | tr -d '\n' || true
}

start_web_windows() {
  local name="web"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"
  local err_file="$LOG_DIR/$name.err.log"

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && pid_exists "$existing_pid"; then
      echo "Process already running: $name (pid=$existing_pid)"
      return 0
    fi
  fi

  ensure_cmd cmd.exe "WSL must have Windows interop enabled (cmd.exe available)."
  ensure_cmd powershell.exe "WSL must have Windows interop enabled (powershell.exe available)."

  local web_workdir_win
  web_workdir_win="$(to_windows_path "$ROOT/apps/web")"
  local log_file_win
  log_file_win="$(to_windows_path "$log_file")"
  local err_file_win
  err_file_win="$(to_windows_path "$err_file")"
  local cmd_file
  cmd_file="$STATE_DIR/web-dev.cmd"
  local cmd_file_win
  cmd_file_win="$(to_windows_path "$cmd_file")"

  python3 - "$cmd_file" "$web_workdir_win" "$WEB_PORT" "$NEXT_PUBLIC_API_URL" "$LAW_EYE_API_PROXY_TARGET" "$log_file_win" "$err_file_win" <<'PY'
import pathlib
import sys

path, workdir, web_port, web_origin, proxy_target, out_log, err_log = sys.argv[1:]

content = f"""@echo off
setlocal
cd /d {workdir}
set WEB_PORT={web_port}
set PORT={web_port}
set NEXT_PUBLIC_API_URL={web_origin}
set LAW_EYE_API_PROXY_TARGET={proxy_target}
set NEXT_TEST_WASM=1
set NEXT_TELEMETRY_DISABLED=1
pnpm dev 1> "{out_log}" 2> "{err_log}"
"""

content = content.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
pathlib.Path(path).write_text(content, encoding="utf-8", newline="")
PY

  echo "Starting $name..."
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath cmd.exe -WorkingDirectory '${web_workdir_win}' -ArgumentList '/v:on','/c','call \"${cmd_file_win}\"'" >/dev/null 2>&1 || true

  local pid=""
  for _ in $(seq 1 60); do
    pid="$(windows_listen_pid "$WEB_PORT")"
    if [[ -n "$pid" ]]; then
      break
    fi
    sleep 0.5
  done

  if [[ -n "$pid" ]]; then
    echo "win:$pid" >"$pid_file"
  else
    echo "WARN: failed to detect Windows PID for web port $WEB_PORT; stop may require manual cleanup." >&2
  fi
}

echo "Building API + worker (CARGO_TARGET_DIR=$CARGO_TARGET_DIR)..."
(cd "$ROOT" && cargo build -p law-eye-api -p law-eye-worker >"$LOG_DIR/cargo-build.log" 2>&1)

API_BIN="$CARGO_TARGET_DIR/debug/law-eye-api"
WORKER_BIN="$CARGO_TARGET_DIR/debug/law-eye-worker"

start_bg api "$ROOT" "$API_BIN"

echo "Waiting for API /health..."
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
  echo "ERROR: API did not become ready. See: $LOG_DIR/api.log" >&2
  exit 1
fi

start_bg worker "$ROOT" "$WORKER_BIN"

if [[ "$NODE_PLATFORM" == "win32" ]]; then
  if ! powershell.exe -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:${API_PORT}/health).StatusCode } catch { exit 1 }" >/dev/null 2>&1; then
    if [[ -z "$WSL_HOST_IP" ]]; then
      WSL_HOST_IP="$(get_primary_ipv4)"
    fi
    if [[ -z "$WSL_HOST_IP" ]]; then
      echo "ERROR: Windows cannot reach API via localhost and failed to detect WSL IPv4. Set LAW_EYE_WSL_HOST_IP manually." >&2
      exit 1
    fi
    LAW_EYE_API_PROXY_TARGET="http://${WSL_HOST_IP}:${API_PORT}"
    echo "INFO: Windows cannot reach WSL API via localhost. Using LAW_EYE_API_PROXY_TARGET=$LAW_EYE_API_PROXY_TARGET for Next rewrites." >&2
  fi
fi

export NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL"
export LAW_EYE_API_PROXY_TARGET="$LAW_EYE_API_PROXY_TARGET"
if [[ "$NODE_PLATFORM" == "win32" ]]; then
  start_web_windows
else
  start_bg web "$ROOT/apps/web" pnpm dev
fi

echo "Waiting for Web /login..."
if [[ "$NODE_PLATFORM" == "win32" ]]; then
  for _ in $(seq 1 90); do
    if powershell.exe -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:${WEB_PORT}/login).StatusCode } catch { exit 1 }" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! powershell.exe -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:${WEB_PORT}/login).StatusCode } catch { exit 1 }" >/dev/null 2>&1; then
    echo "ERROR: Web did not become ready. See: $LOG_DIR/web.log ($LOG_DIR/web.err.log)" >&2
    exit 1
  fi
else
  for _ in $(seq 1 90); do
    if curl -fsS "http://localhost:${WEB_PORT}/login" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ! curl -fsS "http://localhost:${WEB_PORT}/login" >/dev/null 2>&1; then
    echo "ERROR: Web did not become ready. See: $LOG_DIR/web.log" >&2
    exit 1
  fi
fi

cat >"$STATE_DIR/stack.env" <<EOF
STACK_NAME=$STACK_NAME
POSTGRES_PORT=$POSTGRES_PORT
REDIS_PORT=$REDIS_PORT
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
LAW_EYE_API_PROXY_TARGET=$LAW_EYE_API_PROXY_TARGET
WSL_HOST_IP=${WSL_HOST_IP:-}
EOF

echo "Stack ready:"
echo "  Postgres: localhost:${POSTGRES_PORT}"
echo "  Redis:    localhost:${REDIS_PORT}"
echo "  API:      http://localhost:${API_PORT}"
echo "  Web:      http://localhost:${WEB_PORT}"
echo "State: $STATE_DIR"

RUNNING=0
