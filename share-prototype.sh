#!/usr/bin/env bash
# Starts WeFixer as one public link. Keep this Terminal window open — the link
# stays live until you press Ctrl+C or close the window.
#
#   ./share-prototype.sh
set -e
cd "$(dirname "$0")"

PORT=8080

echo "▶ Building frontend (first run only)…"
if [ ! -f client/dist/index.html ]; then
  (cd client && VITE_API_BASE="" npm install --silent && npm run build)
fi

echo "▶ Starting WeFixer on http://localhost:$PORT …"
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
NODE_ENV=production PORT=$PORT \
CLIENT_DIST="$(pwd)/client/dist" \
DATABASE_FILE="$(pwd)/server/data/wefix-public.sqlite" \
SEED_ON_BOOT=true \
node server/src/index.js > server/wefix-public.log 2>&1 &
APP_PID=$!

# Clean up the app server when this script exits.
trap 'echo; echo "▶ Stopping…"; kill $APP_PID 2>/dev/null; exit 0' INT TERM

# Wait for the server to be healthy.
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/health"; then break; fi
  sleep 0.5
done
echo "✓ App is running."
echo
echo "▶ Opening public tunnel — your link will appear below."
echo "  (Keep this window open. Logins: customer@ / vendor.berlin@ / admin@wefixsetu.com — password123)"
echo
# Foreground: prints the https://...trycloudflare.com URL and stays alive.
cloudflared tunnel --url "http://localhost:$PORT"
