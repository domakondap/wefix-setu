#!/usr/bin/env bash
# Idempotent Cloud Agent / local start for WeFix Setu.
# Starts the API (port 4000) and Vite UI (port 5173) if they are not already
# healthy, waits until both respond, then returns.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_URL="${WEFIX_API_URL:-http://127.0.0.1:4000/api/health}"
WEB_URL="${WEFIX_WEB_URL:-http://127.0.0.1:5173}"
LOG_DIR="${WEFIX_LOG_DIR:-/tmp/wefix-logs}"
mkdir -p "$LOG_DIR" "$ROOT/server/data"

if [[ ! -f "$ROOT/server/.env" ]]; then
  cp "$ROOT/server/.env.example" "$ROOT/server/.env"
fi
if [[ ! -f "$ROOT/client/.env" ]]; then
  cp "$ROOT/client/.env.example" "$ROOT/client/.env"
fi

if [[ ! -d "$ROOT/server/node_modules" ]]; then
  npm install --prefix server
fi
if [[ ! -d "$ROOT/client/node_modules" ]]; then
  npm install --prefix client
fi

healthy() {
  curl -sf "$API_URL" >/dev/null && curl -sf "$WEB_URL" >/dev/null
}

if healthy; then
  echo "WeFix Setu already running: API ${API_URL}  UI ${WEB_URL}"
  exit 0
fi

TMUX_ARGS=()
if [[ -f /exec-daemon/tmux.portal.conf ]]; then
  TMUX_ARGS=(-f /exec-daemon/tmux.portal.conf)
fi

start_session() {
  local name="$1"
  local command="$2"
  local log="$3"
  if tmux "${TMUX_ARGS[@]}" has-session -t "=$name" 2>/dev/null; then
    return 0
  fi
  tmux "${TMUX_ARGS[@]}" new-session -d -s "$name" -c "$ROOT" -- \
    bash -lc "$command >>'$log' 2>&1"
}

# Seed empty databases on boot so a fresh Cloud Agent is never a blank app.
start_session wefix-api \
  "SEED_ON_BOOT=true npm run dev --prefix server" \
  "$LOG_DIR/api.log"
start_session wefix-web \
  "npm run dev --prefix client -- --host 0.0.0.0 --port 5173 --strictPort" \
  "$LOG_DIR/web.log"

for _ in $(seq 1 60); do
  if healthy; then
    echo "WeFix Setu ready: API http://127.0.0.1:4000  UI http://127.0.0.1:5173"
    echo "Demo logins (password123): customer@wefixsetu.com / vendor.berlin@wefixsetu.com / admin@wefixsetu.com"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for WeFix Setu to become healthy." >&2
echo "--- API log ---" >&2
tail -n 80 "$LOG_DIR/api.log" 2>/dev/null || true
echo "--- Web log ---" >&2
tail -n 80 "$LOG_DIR/web.log" 2>/dev/null || true
exit 1
