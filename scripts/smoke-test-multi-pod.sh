#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)

cleanup() {
  echo "Tearing down multi-pod staging containers..."
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== 1. Starting db and redis ==="
"${COMPOSE[@]}" up -d db redis

echo "=== 2. Running migrations ==="
"${COMPOSE[@]}" run --rm migrator

echo "=== 3. Starting backend and 2 worker pods ==="
"${COMPOSE[@]}" up -d --scale fastify-worker=2 fastify-backend fastify-worker

echo "=== 2. Waiting for containers to become healthy ==="
for i in $(seq 1 30); do
  BACKEND_HEALTH="$("${COMPOSE[@]}" ps fastify-backend --format '{{.Health}}')"
  WORKER1_HEALTH="$("${COMPOSE[@]}" ps fastify-worker --format '{{.Health}}' | head -n1)"
  WORKER2_HEALTH="$("${COMPOSE[@]}" ps fastify-worker --format '{{.Health}}' | tail -n1)"
  
  if [ "$BACKEND_HEALTH" = "healthy" ] && [ "$WORKER1_HEALTH" = "healthy" ] && [ "$WORKER2_HEALTH" = "healthy" ]; then
    echo "✔ All containers are healthy (fastify-backend and 2 fastify-worker pods)!"
    break
  fi
  echo "Waiting for healthchecks (attempt $i/30)... backend: $BACKEND_HEALTH, worker1: $WORKER1_HEALTH, worker2: $WORKER2_HEALTH"
  sleep 2
done

echo "=== 3. Running multi-pod smoke verification ==="
"${COMPOSE[@]}" exec -T fastify-backend node --input-type=module - < scripts/smoke-test-multi-pod.mjs

echo "=== 4. Verifying metrics on second worker pod directly ==="
WORKER2_METRICS="$("${COMPOSE[@]}" exec -T --index=2 fastify-worker node -e "
  require('http').get('http://localhost:9092/metrics', (r) => {
    let d = '';
    r.on('data', (c) => (d += c));
    r.on('end', () => { process.stdout.write(d); process.exit(r.statusCode === 200 ? 0 : 1); });
  }).on('error', () => process.exit(1));
")"

if echo "$WORKER2_METRICS" | grep -q 'nodejs_version_info'; then
  echo "✔ Second worker pod :9092/metrics successfully scraped ($(echo "$WORKER2_METRICS" | wc -l) lines)!"
else
  echo "❌ Failed to scrape :9092 from second worker pod"
  exit 1
fi

echo "=== ALL MULTI-POD STAGING SMOKE CHECKS PASSED ==="
