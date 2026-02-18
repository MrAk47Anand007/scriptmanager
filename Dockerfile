# =============================================================================
# ScriptManager — Multi-stage Dockerfile
# =============================================================================

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
# Install ALL dependencies (including dev) so we can build
FROM node:20-bookworm-slim AS deps

# node-pty needs Python + build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app
COPY . .

# Build Next.js (standard mode, not standalone — we use our custom server.ts)
RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# Runtime deps for node-pty (needs Python for subprocess management)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 bash curl \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd --system scriptmanager && \
    useradd --system --gid scriptmanager --shell /bin/bash scriptmanager

WORKDIR /app

# Copy built app and runtime files
COPY --from=builder --chown=scriptmanager:scriptmanager /app/node_modules ./node_modules
COPY --from=builder --chown=scriptmanager:scriptmanager /app/.next ./.next
COPY --from=builder --chown=scriptmanager:scriptmanager /app/prisma ./prisma
COPY --from=builder --chown=scriptmanager:scriptmanager /app/public ./public
COPY --from=builder --chown=scriptmanager:scriptmanager /app/src ./src
COPY --from=builder --chown=scriptmanager:scriptmanager /app/cli ./cli
COPY --from=builder --chown=scriptmanager:scriptmanager \
    /app/package.json \
    /app/package-lock.json \
    /app/tsconfig.json \
    /app/tsconfig.server.json \
    /app/next.config.ts \
    /app/server.ts \
    ./

# Runtime directories
RUN mkdir -p /data/db /data/scripts /data/builds && \
    chown -R scriptmanager:scriptmanager /data

USER scriptmanager

# Environment defaults (can be overridden via docker run -e or compose)
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL="file:/data/db/scriptmanager.db" \
    SCRIPTS_DIR="/data/scripts" \
    BUILDS_DIR="/data/builds" \
    SESSION_SECRET="change-me-in-production"

EXPOSE 3000

# Healthcheck — polls the auth endpoint (always returns 200 or 204, never 5xx)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fs http://localhost:3000/api/auth/login || exit 1

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]