# Single-container build for Cloud Run / any container host.
# Builds the React frontend, then runs the Express API which also serves the
# built SPA on the same origin (so auth + SSE work without CORS config).

# --- Stage 1: build the frontend ---
FROM node:22-slim AS client
WORKDIR /client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
# Empty base => the SPA calls the API same-origin at /api.
ENV VITE_API_BASE=""
RUN npm run build

# --- Stage 2: server runtime ---
FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/src ./src
# Bring the built SPA in so Express can serve it.
COPY --from=client /client/dist ./public

ENV NODE_ENV=production
ENV CLIENT_DIST=/app/public
# Cloud Run's filesystem is ephemeral; /tmp is writable. Demo data is seeded on
# boot when the DB is empty (SEED_ON_BOOT=true).
ENV DATABASE_FILE=/tmp/wefix.sqlite
ENV SEED_ON_BOOT=true
# Cloud Run injects PORT (default 8080); config.js reads it.

EXPOSE 8080
CMD ["node", "src/index.js"]
