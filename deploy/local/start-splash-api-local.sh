#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
API_DIR="$REPO_ROOT/services/splash-api"
PROTOCOL_DIR="$REPO_ROOT/services/splash-protocol"
FRONTEND_DIR="$REPO_ROOT/services/splash-frontend"
DEFAULT_ENV_FILE="$SCRIPT_DIR/splash-api.env.example"
DEFAULT_PROTOCOL_ENV_FILE="$SCRIPT_DIR/splash-protocol.env.example"
DEFAULT_FRONTEND_ENV_FILE="$SCRIPT_DIR/splash-frontend.env.example"
ENV_FILE="${SPLASH_API_ENV_FILE:-$DEFAULT_ENV_FILE}"
PROTOCOL_ENV_FILE="${SPLASH_PROTOCOL_ENV_FILE:-$DEFAULT_PROTOCOL_ENV_FILE}"
FRONTEND_ENV_FILE="${SPLASH_FRONTEND_ENV_FILE:-$DEFAULT_FRONTEND_ENV_FILE}"
NATS_SERVER_BIN="${NATS_SERVER_BIN:-$(command -v nats-server || true)}"
NATS_BIND_HOST="${NATS_BIND_HOST:-0.0.0.0}"
NATS_PID=""
PROTOCOL_PID=""
FRONTEND_PID=""

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Splash API env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$PROTOCOL_ENV_FILE" ]]; then
  echo "Splash Protocol env file not found: $PROTOCOL_ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$FRONTEND_ENV_FILE" ]]; then
  echo "Splash Frontend env file not found: $FRONTEND_ENV_FILE" >&2
  exit 1
fi

if [[ ! -d "$API_DIR/node_modules" ]]; then
  echo "Missing dependencies in $API_DIR. Run 'cd $API_DIR && npm install' first." >&2
  exit 1
fi

if [[ ! -d "$PROTOCOL_DIR/node_modules" ]]; then
  echo "Missing dependencies in $PROTOCOL_DIR. Run 'cd $PROTOCOL_DIR && npm install' first." >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Missing dependencies in $FRONTEND_DIR. Run 'cd $FRONTEND_DIR && npm install' first." >&2
  exit 1
fi

if [[ -z "$NATS_SERVER_BIN" ]]; then
  echo "nats-server is required to start local NATS." >&2
  echo "Install it with 'brew install nats-server' or set NATS_SERVER_BIN." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to start splash-api." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${NATS_URL:-}" ]]; then
  echo "NATS_URL must be set after loading $ENV_FILE." >&2
  exit 1
fi

if [[ -z "${API_HTTP_BIND:-}" ]]; then
  echo "API_HTTP_BIND must be set after loading $ENV_FILE." >&2
  exit 1
fi

if [[ -n "${SQLITE_PATH:-}" && "${SQLITE_PATH}" != ":memory:" && "${SQLITE_PATH}" != file:* ]]; then
  SQLITE_PARENT_DIR=$(dirname "${SQLITE_PATH}")
  mkdir -p "$SQLITE_PARENT_DIR"
fi

API_HOST="${API_HTTP_BIND%:*}"
API_PORT="${API_HTTP_BIND##*:}"
NATS_TARGET="${NATS_URL#nats://}"
NATS_TARGET="${NATS_TARGET%%,*}"
NATS_HOST="${NATS_TARGET%:*}"
NATS_PORT="${NATS_TARGET##*:}"

set -a
source "$PROTOCOL_ENV_FILE"
set +a

if [[ -z "${PROTOCOL_HTTP_BIND:-}" ]]; then
  echo "PROTOCOL_HTTP_BIND must be set after loading $PROTOCOL_ENV_FILE." >&2
  exit 1
fi

PROTOCOL_HOST="${PROTOCOL_HTTP_BIND%:*}"
PROTOCOL_PORT="${PROTOCOL_HTTP_BIND##*:}"

set -a
source "$FRONTEND_ENV_FILE"
set +a

FRONTEND_HTTP_BIND="${FRONTEND_HTTP_BIND:-127.0.0.1:3002}"

FRONTEND_HOST="${FRONTEND_HTTP_BIND%:*}"
FRONTEND_PORT="${FRONTEND_HTTP_BIND##*:}"

if [[ -z "$API_HOST" || -z "$API_PORT" ]]; then
  echo "API_HTTP_BIND must look like host:port. Current value: $API_HTTP_BIND" >&2
  exit 1
fi

if [[ -z "$NATS_HOST" || -z "$NATS_PORT" ]]; then
  echo "NATS_URL must look like nats://host:port. Current value: $NATS_URL" >&2
  exit 1
fi

if [[ -z "$PROTOCOL_HOST" || -z "$PROTOCOL_PORT" ]]; then
  echo "PROTOCOL_HTTP_BIND must look like host:port. Current value: $PROTOCOL_HTTP_BIND" >&2
  exit 1
fi

if [[ -z "$FRONTEND_HOST" || -z "$FRONTEND_PORT" ]]; then
  echo "FRONTEND_HTTP_BIND must look like host:port. Current value: $FRONTEND_HTTP_BIND" >&2
  exit 1
fi

if lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $API_PORT is already in use." >&2
  echo "Set API_HTTP_BIND in $ENV_FILE or override SPLASH_API_ENV_FILE to use a different port." >&2
  exit 1
fi

if lsof -nP -iTCP:"$PROTOCOL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Protocol port $PROTOCOL_PORT is already in use." >&2
  echo "Set PROTOCOL_HTTP_BIND in $PROTOCOL_ENV_FILE or override SPLASH_PROTOCOL_ENV_FILE to use a different port." >&2
  exit 1
fi

if lsof -nP -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Frontend port $FRONTEND_PORT is already in use." >&2
  echo "Set FRONTEND_HTTP_BIND in $FRONTEND_ENV_FILE or override SPLASH_FRONTEND_ENV_FILE to use a different port." >&2
  exit 1
fi

if lsof -nP -iTCP:"$NATS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "NATS port $NATS_PORT is already in use." >&2
  echo "Update NATS_URL in $ENV_FILE or stop the existing service before retrying." >&2
  exit 1
fi

cleanup() {
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$PROTOCOL_PID" ]] && kill -0 "$PROTOCOL_PID" >/dev/null 2>&1; then
    kill "$PROTOCOL_PID" >/dev/null 2>&1 || true
    wait "$PROTOCOL_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$NATS_PID" ]] && kill -0 "$NATS_PID" >/dev/null 2>&1; then
    kill "$NATS_PID" >/dev/null 2>&1 || true
    wait "$NATS_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting local NATS with $NATS_SERVER_BIN on ${NATS_BIND_HOST}:${NATS_PORT}"
"$NATS_SERVER_BIN" -a "$NATS_BIND_HOST" -p "$NATS_PORT" -m 8222 >/tmp/splash-local-nats.log 2>&1 &
NATS_PID=$!
sleep 1

if ! kill -0 "$NATS_PID" >/dev/null 2>&1; then
  echo "Failed to start nats-server. Check /tmp/splash-local-nats.log" >&2
  exit 1
fi

echo "Local NATS is up on ${NATS_BIND_HOST}:${NATS_PORT}"
echo "Configure splash-serial to publish to nats://<this-machine-lan-ip>:${NATS_PORT}"
echo "Starting splash-protocol on $PROTOCOL_HTTP_BIND"
(
  cd "$PROTOCOL_DIR"
  exec npm run dev
) >/tmp/splash-local-protocol.log 2>&1 &
PROTOCOL_PID=$!
sleep 1

if ! kill -0 "$PROTOCOL_PID" >/dev/null 2>&1; then
  echo "Failed to start splash-protocol. Check /tmp/splash-local-protocol.log" >&2
  exit 1
fi

echo "Starting splash-frontend on $FRONTEND_HTTP_BIND"
echo "Frontend URL: http://$FRONTEND_HTTP_BIND"
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) >/tmp/splash-local-frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 1

if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
  echo "Failed to start splash-frontend. Check /tmp/splash-local-frontend.log" >&2
  exit 1
fi

echo "Starting splash-api on $API_HTTP_BIND"
echo "Health URL: http://$API_HTTP_BIND/health"
echo "Metrics URL: http://$API_HTTP_BIND/metrics"
echo "Protocol health URL: http://$PROTOCOL_HTTP_BIND/healthz"
echo "Protocol metrics URL: http://$PROTOCOL_HTTP_BIND/metrics"

cd "$API_DIR"
exec npm run dev
