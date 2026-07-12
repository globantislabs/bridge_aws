# syntax=docker/dockerfile:1.7

# ============================================================
#  Bridge — Production Dockerfile
#  Multi-stage build. Final image ~180MB. Runs as non-root user.
# ============================================================

# ---- Stage 1: Install deps ----
FROM node:20-slim AS deps
WORKDIR /app

# Install bun (faster installs) + openssl (needed by Prisma)
RUN npm install -g bun@1.1.0 && \
    apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy lockfile + package.json first for layer caching
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- Stage 2: Build ----
FROM node:20-slim AS builder
WORKDIR /app

RUN npm install -g bun@1.1.0 && \
    apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (needs schema)
RUN bunx prisma generate

# Build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- Stage 3: Runner ----
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    # Create non-root user
    groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma: schema + migrations + client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Pre-flight check script
COPY --from=builder --chown=nextjs:nodejs /app/scripts/preflight.mjs ./scripts/preflight.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/test-api.mjs ./scripts/test-api.mjs

# DB storage (for SQLite dev). For prod, mount a volume here.
RUN mkdir -p db && chown -R nextjs:nodejs db

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Health check — hits /api/health, expects 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:'+ (process.env.PORT||3000) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run pre-flight, then start the server. If pre-flight fails, the container
# will exit with code 1 so the orchestrator (App Runner / ECS / k8s) restarts it.
CMD ["sh", "-c", "node scripts/preflight.mjs --quiet && node server.js"]
