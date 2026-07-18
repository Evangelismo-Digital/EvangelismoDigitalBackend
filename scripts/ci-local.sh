#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml — run before every push (pre-push
# hook) so nothing red ever reaches GitHub. Stages mirror the CI jobs 1:1;
# when a command changes here, change it in ci.yml too (and vice versa).
#
# Requires: Docker (daemon running), Node per .nvmrc, deps installed (npm ci).
# Escape hatch: git push --no-verify.
set -euo pipefail

cd "$(dirname "$0")/.."

# Source the committed .env.test as the single source of truth (also used
# below for the Docker smoke test's --env-file) instead of duplicating
# secrets/config here — duplicating them trips gitleaks on this file with no
# baseline coverage, since --pre-commit/--staged scans the diff, not history.
set -a
source .env.test
set +a
# Not in .env.test (only needed by the CLI/CI, not by the running app);
# mirrors the `test` job env block in ci.yml.
export SHADOW_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/prisma_shadow?schema=public'

STAGE_TIMES=()
STAGE_START=0

stage() {
  STAGE_START=$(date +%s)
  printf '\n\033[1;34m━━━ %s ━━━\033[0m\n' "$1"
}

stage_done() {
  local elapsed=$(( $(date +%s) - STAGE_START ))
  STAGE_TIMES+=("$1: ${elapsed}s")
  printf '\033[1;32m✔ %s (%ss)\033[0m\n' "$1" "$elapsed"
}

cleanup() {
  docker rm -f app-smoke-local >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
stage 'Preflight (Docker + compose stack)'
docker info >/dev/null 2>&1 || { echo 'ERRO: Docker daemon não está acessível.' >&2; exit 1; }

EXPECTED_NODE=$(cat .nvmrc | tr -d 'v[:space:]')
ACTUAL_NODE=$(node --version | tr -d 'v')
if [ "$EXPECTED_NODE" != "$ACTUAL_NODE" ]; then
  echo "AVISO: Node local é v${ACTUAL_NODE}, mas .nvmrc pede v${EXPECTED_NODE} (CI usa .nvmrc)." >&2
fi

# Same dev stack the e2e tests use; --wait blocks on the compose healthchecks.
docker compose up -d --wait
stage_done 'Preflight'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Static checks (mirrors job: static)'
npx prisma generate
npm run ci:static
stage_done 'Static checks'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Secret scan — gitleaks (mirrors job: secret-scan)'
docker run --rm -v "$(pwd):/repo" -w /repo \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo \
  ghcr.io/gitleaks/gitleaks:v8.30.1 \
  detect --source=/repo --config=/repo/.gitleaks.toml \
  --baseline-path=/repo/.gitleaks-baseline.json \
  --redact
stage_done 'Secret scan'

# ─────────────────────────────────────────────────────────────────────────────
stage 'SAST — Semgrep (mirrors job: sast; needs network for rulesets)'
docker run --rm -v "$(pwd):/src" -w /src \
  semgrep/semgrep:1.170.0 \
  semgrep scan --metrics=off --error \
  --config p/typescript --config p/nodejs --config p/javascript
stage_done 'SAST'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Dependency vulnerabilities — OSV-Scanner (mirrors job: deps)'
docker run --rm -v "$(pwd):/repo" -w /repo \
  ghcr.io/google/osv-scanner:v2.3.8 \
  --config=osv-scanner.toml --lockfile=package-lock.json
stage_done 'Dependency vulnerabilities'

# ─────────────────────────────────────────────────────────────────────────────
stage 'License compliance — Trivy (mirrors job: license)'
docker run --rm -v "$(pwd):/repo" \
  aquasec/trivy:0.72.0 \
  fs --scanners license --severity HIGH,CRITICAL --exit-code 1 /repo
stage_done 'License compliance'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Tests + coverage (mirrors job: test)'
# Prisma 7's config-based shadowDatabaseUrl requires the DB to pre-exist.
docker compose exec -T db psql -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='prisma_shadow'" | grep -q 1 \
  || docker compose exec -T db psql -U postgres -c 'CREATE DATABASE prisma_shadow;'

npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema ./prisma/schema.prisma \
  --exit-code

npx prisma migrate deploy

# Same explicit project allowlist as ci.yml (see comment there for why the
# flaky e2e-api-providers-fallback-strategy and redundant e2e-users are absent).
npx vitest run --coverage \
  --project=unit-errors --project=unit-use-cases --project=unit-churches \
  --project=unit-users --project=unit-messaging --project=unit-forms \
  --project=unit-geo-provider --project=unit-address-provider --project=unit-http \
  --project=unit-http-users --project=unit-church-routing-provider --project=unit-lib \
  --project=unit-resilient-cache --project=unit-rate-limiter --project=e2e \
  --coverage.reporter=json-summary \
  --coverage.reporter=json \
  --coverage.reporter=text \
  --coverage.reportOnFailure=true
stage_done 'Tests + coverage'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Build verification — tsup (mirrors job: build)'
# dist/ is tracked in git; build into a gitignored scratch dir so a
# verification build never dirties the working tree mid-push.
npx tsup src/server.ts src/worker.ts --format cjs --clean --out-dir .ci-local/dist
stage_done 'Build verification'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Docker build + smoke test (mirrors job: docker)'
# The smoke test polls :3333 — a dev server already listening there would make
# the check pass against the WRONG process, so refuse to run in that case.
if curl -sf http://localhost:3333/health/ >/dev/null 2>&1; then
  echo 'ERRO: já existe um servidor respondendo em localhost:3333 (npm run dev?).' >&2
  echo 'Pare-o antes de rodar o ci:local para o smoke test do Docker.' >&2
  exit 1
fi

docker build -t evangelismo-digital-backend:local-ci .

docker run -d --name app-smoke-local --network host --env-file .env.test \
  evangelismo-digital-backend:local-ci

SMOKE_OK=0
for _ in $(seq 1 20); do
  if curl -sf http://localhost:3333/health/ >/dev/null; then
    SMOKE_OK=1
    echo 'App is healthy'
    break
  fi
  echo 'Waiting for app...'
  sleep 1
done

if [ "$SMOKE_OK" -ne 1 ]; then
  echo 'App did not become healthy in time — container logs:' >&2
  docker logs app-smoke-local >&2 || true
  exit 1
fi

docker rm -f app-smoke-local >/dev/null
stage_done 'Docker build + smoke test'

# ─────────────────────────────────────────────────────────────────────────────
printf '\n\033[1;32m━━━ CI local: todas as etapas passaram ━━━\033[0m\n'
for t in "${STAGE_TIMES[@]}"; do
  echo "  $t"
done
