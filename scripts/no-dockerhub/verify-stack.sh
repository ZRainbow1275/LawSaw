#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/no-dockerhub/verify-stack.sh [--name <stack-name>] [--state-dir <path>] [--wait <seconds>]

Checks health endpoints for a stack started via scripts/no-dockerhub/start-stack.sh.

Options:
  --name <stack-name>   Stack identifier (default: law-eye-local)
  --state-dir <path>    Explicit state dir path (overrides LAW_EYE_NO_DOCKERHUB_STATE_DIR)
  --wait <seconds>      Retry health checks up to N seconds (default: 0)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

STACK_NAME="${LAW_EYE_STACK_NAME:-law-eye-local}"
STATE_DIR=""
WAIT_SECONDS=0

while [[ $# -gt 0 ]]; do
	case "$1" in
		--name)
			STACK_NAME="${2:-}"
			shift 2
			;;
		--state-dir)
			STATE_DIR="${2:-}"
			shift 2
			;;
		--wait)
			WAIT_SECONDS="${2:-0}"
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

if ! command -v curl >/dev/null 2>&1; then
	echo "ERROR: missing required command: curl" >&2
	exit 1
fi

case "${WAIT_SECONDS}" in
	''|*[!0-9]*)
		echo "ERROR: --wait must be an integer seconds (got: ${WAIT_SECONDS})" >&2
		exit 1
		;;
esac

if [[ -z "$STATE_DIR" ]]; then
	DEFAULT_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
	DEFAULT_STATE_DIR="${DEFAULT_STATE_HOME}/law-eye/no-dockerhub/${STACK_NAME}"
	LEGACY_STATE_DIR="$ROOT/tmp/no-dockerhub/$STACK_NAME"

	STATE_DIR_RAW="${LAW_EYE_NO_DOCKERHUB_STATE_DIR:-$DEFAULT_STATE_DIR}"
	if [[ -z "${LAW_EYE_NO_DOCKERHUB_STATE_DIR:-}" && ! -d "$STATE_DIR_RAW" && -d "$LEGACY_STATE_DIR" ]]; then
		echo "WARN: falling back to legacy repo-workspace state dir: $LEGACY_STATE_DIR" >&2
		STATE_DIR_RAW="$LEGACY_STATE_DIR"
	fi
	STATE_DIR="$STATE_DIR_RAW"
fi

STACK_ENV="$STATE_DIR/stack.env"
if [[ ! -f "$STACK_ENV" ]]; then
	echo "ERROR: missing stack env file: $STACK_ENV" >&2
	echo "Hint: start stack via scripts/no-dockerhub/start-stack.sh first." >&2
	exit 1
fi

set -a
source <(tr -d '\r' < "$STACK_ENV")
set +a

request_ok() {
	name="$1"
	url="$2"
	if ! curl -fsS --max-time 5 "$url" >/dev/null; then
		echo "[verify] failed: ${name} url=${url}" >&2
		return 1
	fi
	echo "[verify] ok: ${name} url=${url}"
}

check_once() {
	local ok=0

	if [[ -n "${API_PORT:-}" ]]; then
		request_ok "api_health" "http://127.0.0.1:${API_PORT}/health" || ok=1
	else
		echo "[verify] warn: API_PORT is missing in stack.env" >&2
		ok=1
	fi

	if [[ -n "${LAW_EYE__WORKER__HEALTH_PORT:-}" ]]; then
		request_ok "worker_health" "http://127.0.0.1:${LAW_EYE__WORKER__HEALTH_PORT}/health" || ok=1
	else
		echo "[verify] warn: LAW_EYE__WORKER__HEALTH_PORT is missing in stack.env" >&2
		ok=1
	fi

	if [[ -n "${MINIO_API_PORT:-}" ]]; then
		request_ok "minio_ready" "http://127.0.0.1:${MINIO_API_PORT}/minio/health/ready" || ok=1
	fi

	if [[ "${WEB_ENABLED:-1}" == "1" && -n "${WEB_PORT:-}" ]]; then
		web_base="http://127.0.0.1:${WEB_PORT}"
		if [[ "${WEB_RUNS_ON_WINDOWS:-0}" == "1" && -n "${WINDOWS_HOST_IP:-}" ]]; then
			web_base="http://${WINDOWS_HOST_IP}:${WEB_PORT}"
		fi
		request_ok "web_login" "${web_base}/login" || ok=1
	fi

	return "$ok"
}

if [[ "$WAIT_SECONDS" -gt 0 ]]; then
	deadline=$(( $(date +%s) + WAIT_SECONDS ))
	while true; do
		if check_once; then
			break
		fi
		if [[ "$(date +%s)" -ge "$deadline" ]]; then
			echo "[verify] timed out after ${WAIT_SECONDS}s" >&2
			exit 1
		fi
		sleep 1
	done
else
	check_once
fi

if command -v docker >/dev/null 2>&1; then
	for svc in postgres redis minio; do
		container_name="${STACK_NAME}-${svc}"
		cid="$(docker ps -q --filter "name=^${container_name}$" | tr -d '\r' | tr -d '\n')"
		if [[ -n "$cid" ]]; then
			echo "[verify] ok: container running: ${container_name} (id=${cid})"
		else
			echo "[verify] warn: container not running: ${container_name}" >&2
		fi
	done
fi

echo "[verify] completed"
