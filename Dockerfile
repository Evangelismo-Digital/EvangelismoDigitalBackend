# syntax=docker/dockerfile:1

# ---------- Stage 1: builder ----------
# Compiles TypeScript (server + worker) and generates the Prisma client.
FROM node:20-slim AS builder

# Prisma's engines/generator need OpenSSL present.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps (incl. dev) using the committed lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources (respects .dockerignore) and produce the client + bundles.
COPY . .

# `prisma.config.ts` imports src/env/index.ts, which eagerly validates the FULL
# app env schema on load (not just DB-related vars) — so any Prisma CLI command
# (generate, migrate) needs every required var satisfiable at build time. These
# are throwaway, non-secret build-time-only placeholders (never used at
# runtime — the runner stage below is a separate image with its own env,
# supplied via --env-file/orchestrator secrets); they exist purely so Zod
# validation passes during `prisma generate` / `npm run build`.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
  GRAFANA_ADMIN_PASSWORD=build-time-placeholder \
  JWT_SECRET=build-time-placeholder-jwt-secret-not-used-at-runtime-0000000000000 \
  SMTP_EMAIL=build@example.com \
  SMTP_PASSWORD=build-time-placeholder \
  SMTP_PORT=587 \
  SMTP_HOST=smtp.example.com \
  SMTP_SECURE=false \
  ADMIN_EMAIL=build@example.com \
  AWESOME_API_URL=https://example.com \
  AWESOME_API_TOKEN=build-time-placeholder \
  VIACEP_API_URL=https://example.com \
  BRASIL_API_URL=https://example.com \
  NOMINATIM_API_URL=https://example.com \
  LOCATION_IQ_API_TOKEN=build-time-placeholder \
  STADIA_API_TOKEN=build-time-placeholder

RUN npx prisma generate
RUN npm run build

# ---------- Stage 2: runner ----------
# Minimal production image: prod deps + generated client + compiled bundles.
FROM node:20-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Bring over the generated Prisma client + engines and the compiled output.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Run as an unprivileged user.
RUN chown -R node:node /app
USER node

EXPOSE 3333

# Default entrypoint is the API server; override with `node dist/worker.js` for the worker.
CMD ["node", "dist/server.js"]
