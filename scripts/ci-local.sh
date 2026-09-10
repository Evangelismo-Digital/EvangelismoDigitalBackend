#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml — run before every push (pre-push
# hook) so nothing red ever reaches GitHub. Stages mirror the CI jobs 1:1;
# when a command changes here, change it in ci.yml too (and vice versa).
#
# Requires: Docker (daemon running), Node per .nvmrc, deps installed (npm ci).
# Escape hatch: git push --no-verify.
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Suite lock — shared with .claude/hooks/gate.sh.
#
# Both this script and the Stop hook run the e2e suite against the SAME Postgres
# and Redis. Overlapping runs corrupt each other: truncations race, and the
# IP-keyed rate-limit test sees state it did not create. Whoever holds this lock
# owns the shared services for the duration.
SUITE_LOCK=/tmp/evangelismo-suite.lock
exec 9>"$SUITE_LOCK"
if ! flock -n 9; then
  echo 'ERRO: outra execução da suíte (ci:local ou o Stop hook) já está em andamento.' >&2
  echo 'Elas compartilham Postgres e Redis; rode uma de cada vez.' >&2
  exit 1
fi


cd "$(dirname "$0")/.."

# .env.test is docker --env-file format: unquoted, values may contain spaces
# (APP_NAME), so it must NOT be `source`d. Extract just the keys this script
# needs, keeping .env.test the single source of truth (no secret literals here
# — gitleaks scans the staged diff, where history baselines don't apply).
env_test() { grep -m1 "^$1=" .env.test | cut -d= -f2-; }
export DATABASE_URL="$(env_test DATABASE_URL)"
export REDIS_HOST="$(env_test REDIS_HOST)"
export REDIS_PORT="$(env_test REDIS_PORT)"
export REDIS_PASSWORD="$(env_test REDIS_PASSWORD)"
# Not in .env.test (only needed by the CLI/CI, not by the running app);
# mirrors the `test` job env block in ci.yml.
export SHADOW_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/prisma_shadow?schema=public'

mkdir -p reports/sonar reports/eslint reports/security

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
# CI runs on a fresh checkout; locally these gitignored scratch dirs would add
# phantom targets (e.g. a leftover Stryker sandbox's package-lock.json).
docker run --rm -v "$(pwd):/repo" \
  aquasec/trivy:0.72.0 \
  fs --scanners license --severity HIGH,CRITICAL --exit-code 1 \
  --skip-dirs /repo/.stryker-tmp --skip-dirs /repo/.ci-local /repo
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
  --project=unit-core --project=unit-providers-helpers \
  --project=unit-env --project=unit-errors --project=unit-use-cases --project=unit-churches \
  --project=unit-users --project=unit-messaging --project=unit-forms \
  --project=unit-geo-provider --project=unit-address-provider --project=unit-http \
  --project=unit-http-users --project=unit-church-routing-provider --project=unit-lib \
  --project=unit-resilient-cache --project=unit-rate-limiter --project=unit-repositories \
  --project=integration-cache --project=integration-repositories --project=e2e \
  --coverage.reporter=json-summary \
  --coverage.reporter=json \
  --coverage.reporter=lcov \
  --coverage.reporter=text \
  --coverage.reportOnFailure=true \
  --reporter=default --reporter=json \
  --outputFile.json=reports/sonar/vitest-results.json
stage_done 'Tests + coverage'

# ─────────────────────────────────────────────────────────────────────────────
stage 'SonarQube — quality gate (local-only stage)'
# Deliberately NOT mirrored in ci.yml: SonarQube needs its own Postgres and an
# Elasticsearch heap, takes minutes to boot from a cold volume, and keeps the
# issue history that makes the "new code" half of the gate mean anything — none
# of which survives a fresh GitHub runner. It is a pre-push gate instead, and
# the security stage below (which needs no server) is the part CI does mirror.
#
# The scan reuses the coverage produced by the stage above rather than running
# the suite a second time; it only needs the test-execution XML converted first.
node scripts/vitest-to-sonar.mjs reports/sonar/vitest-results.json reports/sonar/test-execution.xml
npx eslint src/ -f json -o reports/eslint/eslint-report.json || true

bash scripts/sonar.sh up
bash scripts/sonar.sh bootstrap
bash scripts/sonar.sh scan
stage_done 'SonarQube'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Security findings — njsscan + Semgrep + ESLint + Sonar (mirrors job: security-code)'
# Answers a different question from the three scanners above: OSV-Scanner reads
# the lockfile, gitleaks reads the diff, Semgrep's language packs read for
# correctness. This one reads the source for vulnerable PATTERNS and merges
# every tool's verdict into one deduplicated list.
SECURITY_REUSE_REPORTS=1 bash scripts/security-scan.sh
stage_done 'Security findings'

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
