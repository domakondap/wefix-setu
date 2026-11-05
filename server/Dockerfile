# WeFix Setu API — Node 22 (required for the built-in node:sqlite module).
FROM node:22-slim

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source.
COPY src ./src

# Runtime config.
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_FILE=/data/wefix.sqlite

# Persist the SQLite database outside the image layer.
VOLUME /data
EXPOSE 4000

# Migrate + seed on first boot is left to the operator (npm run seed);
# the server auto-migrates on start.
CMD ["node", "src/index.js"]
