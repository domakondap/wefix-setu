#!/usr/bin/env bash
# One-command deploy of WeFix Setu to Google Cloud Run.
# Builds the root Dockerfile via Cloud Build (no local Docker needed) and
# deploys a single container that serves the React SPA + Express API + SQLite.
#
# Prereqs (one-time):
#   1. Install gcloud: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project YOUR_PROJECT_ID   # the project that owns the existing service
#
# Usage:
#   ./deploy-cloudrun.sh
set -euo pipefail

SERVICE="${SERVICE:-wefix-setu}"
REGION="${REGION:-europe-west2}"

# Reuse an existing JWT secret if you set one; otherwise generate a strong one.
JWT_SECRET="${JWT_SECRET:-$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")}"

# Persistent database: set DATABASE_URL to a managed Postgres (e.g. free Neon)
# for permanent storage. If unset, the app uses ephemeral SQLite (demo only).
ENV_VARS="NODE_ENV=production,SEED_ON_BOOT=true,JWT_SECRET=${JWT_SECRET}"
if [ -n "${DATABASE_URL:-}" ]; then
  # Use ^@^ as the delimiter so the connection string's commas aren't split.
  ENV_VARS="^@^${ENV_VARS}@DATABASE_URL=${DATABASE_URL}"
  echo "Using PostgreSQL (DATABASE_URL provided)."
else
  echo "No DATABASE_URL set — deploying with ephemeral SQLite (demo mode)."
fi

echo "Deploying '$SERVICE' to region '$REGION'…"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --set-env-vars "${ENV_VARS}"

echo
echo "Done. Service URL:"
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
