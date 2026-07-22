#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting production deploy..."

# ---------------------------------------------------------------------------
# 1. Load environment variables (NOT injected into containers as files)
# ---------------------------------------------------------------------------
echo "🔐 Loading environment variables..."
set -a
source .env
set +a

# Sanity check (fail fast)
: "${POSTGRES_USER:?Missing POSTGRES_USER}"
: "${POSTGRES_PASSWORD:?Missing POSTGRES_PASSWORD}"
: "${POSTGRES_DB:?Missing POSTGRES_DB}"
: "${DATABASE_URL:?Missing DATABASE_URL}"
: "${REDIS_PASSWORD:?Missing REDIS_PASSWORD}"

# ---------------------------------------------------------------------------
# 2. Pull latest code
# ---------------------------------------------------------------------------
echo "📦 Pulling latest code..."
git pull origin main

# ---------------------------------------------------------------------------
# 3. Build images
# ---------------------------------------------------------------------------
echo "🐳 Building Docker images..."
docker compose -f docker-compose.prod.yml build

# ---------------------------------------------------------------------------
# 4. Start database & redis first
# ---------------------------------------------------------------------------
echo "🗄️  Starting database and redis..."
docker compose -f docker-compose.prod.yml up -d db redis

# ---------------------------------------------------------------------------
# 5. Run migrator (ONE-SHOT)
# ---------------------------------------------------------------------------
echo "🧬 Running Prisma migrator..."
docker compose -f docker-compose.prod.yml up --abort-on-container-exit migrator

# ---------------------------------------------------------------------------
# 6. Start application services
# ---------------------------------------------------------------------------
echo "⚙️  Starting application services..."
docker compose -f docker-compose.prod.yml up -d fastify-backend fastify-worker

# ---------------------------------------------------------------------------
# 7. Cleanup
# ---------------------------------------------------------------------------
echo "🧹 Cleaning unused images..."
docker image prune -f

# ---------------------------------------------------------------------------
# 8. Status
# ---------------------------------------------------------------------------
echo "✅ Deployment finished successfully!"
docker compose -f docker-compose.prod.yml ps