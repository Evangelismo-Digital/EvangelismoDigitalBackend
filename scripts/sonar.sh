#!/usr/bin/env bash
# SonarQube: start the server, bootstrap it, produce the reports it consumes,
# scan, and fail on the quality gate.
#
# Subcommands:
#   up        start the stack and wait until the analysis endpoints answer
#   bootstrap first-run admin password + analysis token + profiles + gate
#   reports   regenerate coverage / test-execution / ESLint inputs (runs tests)
#   scan      run the scanner and enforce the quality gate (assumes reports exist)
#   report    re-read the last analysis without scanning again
#   down      stop the stack (keeps the volumes, and so the issue history)
#   reset     stop the stack AND delete the volumes
#   all       up + bootstrap + reports + scan   (the default)
#
# ci:local calls `up`, `bootstrap` and `scan` separately: it already produced
# coverage in its own test stage, and re-running the suite here would double
# the slowest part of the pipeline.
set -euo pipefail

cd "$(dirname "$0")/.."

SONAR_URL=${SONAR_URL:-http://localhost:9000}
SONAR_COMPOSE=docker-compose.sonar.yml
SONAR_NETWORK=evangelismo-sonar-network
SONAR_STATE_DIR=.sonar
TOKEN_FILE="$SONAR_STATE_DIR/token"
PASSWORD_FILE="$SONAR_STATE_DIR/admin-password"
SCANNER_IMAGE=sonarsource/sonar-scanner-cli:12.1.0.3233_8.0.1
PROJECT_KEY=evangelismo-digital-backend

# Elasticsearch's first boot on a cold volume is the slow case; 10 minutes is
# generous rather than optimistic, and the loop exits as soon as it is UP.
READY_TIMEOUT_SECONDS=${SONAR_READY_TIMEOUT:-600}

log() { printf '\033[1;34m[sonar]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[sonar] ERRO:\033[0m %s\n' "$1" >&2; exit 1; }

sonar_up() {
  docker info >/dev/null 2>&1 || fail 'Docker daemon não está acessível.'
  log 'subindo o stack do SonarQube...'
  docker compose -f "$SONAR_COMPOSE" up -d
  wait_ready
}

# `/api/system/status` reporting UP is NOT enough to start a scan.
#
# The status endpoint is served before the analysis routes are wired, so a scan
# launched the moment it flips UP dies with "Call to URL [.../api/v2/analysis/
# jres] failed: closed" — which looks like a network fault and is really a race.
# It cost two failed runs before being diagnosed. Readiness therefore means
# "the endpoints the scanner actually calls are answering": any HTTP status will
# do, including the 401 an unauthenticated probe gets, because a status line
# proves the route exists.
wait_ready() {
  local waited=0
  log "aguardando $SONAR_URL ficar UP (timeout ${READY_TIMEOUT_SECONDS}s)..."

  while [ "$waited" -lt "$READY_TIMEOUT_SECONDS" ]; do
    if curl -sf "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"' &&
       curl -s -o /dev/null "$SONAR_URL/api/v2/analysis/jres?os=linux&arch=x86_64" 2>/dev/null &&
       curl -s -o /dev/null "$SONAR_URL/api/v2/analysis/engine" 2>/dev/null; then
      log 'SonarQube está UP e servindo os endpoints de análise.'
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done

  docker compose -f "$SONAR_COMPOSE" logs --tail=40 sonarqube >&2 || true
  fail "SonarQube não ficou pronto em ${READY_TIMEOUT_SECONDS}s."
}

# First run only: SonarQube boots with admin/admin. Rotating it immediately and
# keeping the replacement in a 0600 file under .sonar/ (gitignored) means no
# credential ever reaches the repository, and the instance is not left on a
# password every scanner on the network knows.
bootstrap_password() {
  mkdir -p "$SONAR_STATE_DIR"
  chmod 700 "$SONAR_STATE_DIR"

  if [ -f "$PASSWORD_FILE" ]; then
    return 0
  fi

  log 'primeira execução: trocando a senha padrão do admin...'
  local generated
  generated="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)Aa1!"

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -u admin:admin -X POST \
    "$SONAR_URL/api/users/change_password" \
    --data-urlencode 'login=admin' \
    --data-urlencode 'previousPassword=admin' \
    --data-urlencode "password=$generated")

  [ "$code" = '204' ] || fail "não foi possível trocar a senha do admin (HTTP $code). Use 'npm run sonar:reset' se a instância já foi configurada manualmente."

  printf '%s' "$generated" > "$PASSWORD_FILE"
  chmod 600 "$PASSWORD_FILE"
  log "senha do admin gravada em $PASSWORD_FILE"
}

bootstrap_token() {
  if [ -f "$TOKEN_FILE" ] &&
     curl -sf -u "$(cat "$TOKEN_FILE"):" "$SONAR_URL/api/authentication/validate" | grep -q '"valid":true'; then
    return 0
  fi

  log 'gerando token de análise...'
  local password
  password=$(cat "$PASSWORD_FILE")

  curl -sf -u "admin:$password" -X POST "$SONAR_URL/api/user_tokens/generate" \
    --data-urlencode "name=ci-local-$(date +%s)" \
    --data-urlencode 'type=GLOBAL_ANALYSIS_TOKEN' \
    -o "$SONAR_STATE_DIR/token.json" || fail 'falha ao gerar o token.'

  node -e "
    const fs = require('node:fs')
    const { token } = JSON.parse(fs.readFileSync('$SONAR_STATE_DIR/token.json', 'utf8'))
    fs.writeFileSync('$TOKEN_FILE', token, { mode: 0o600 })
  "
  rm -f "$SONAR_STATE_DIR/token.json"
  log "token gravado em $TOKEN_FILE"
}

sonar_bootstrap() {
  bootstrap_password
  bootstrap_token
  node scripts/sonar-configure.mjs
}

# The three reports sonar-project.properties points at. Without them the
# analysis still succeeds and simply reports 0 % coverage and 0 tests, which is
# worse than failing: the dashboard looks authoritative and is wrong.
sonar_reports() {
  log 'gerando cobertura + execução de testes + relatório do ESLint...'
  mkdir -p reports/sonar reports/eslint

  npx vitest run --coverage \
    --project=unit-core --project=unit-providers-helpers \
    --project=unit-errors --project=unit-use-cases --project=unit-churches \
    --project=unit-users --project=unit-messaging --project=unit-forms \
    --project=unit-geo-provider --project=unit-address-provider --project=unit-http \
    --project=unit-http-users --project=unit-church-routing-provider --project=unit-lib \
    --project=unit-resilient-cache --project=unit-rate-limiter --project=unit-repositories \
    --reporter=json --outputFile=reports/sonar/vitest-results.json

  node scripts/vitest-to-sonar.mjs reports/sonar/vitest-results.json reports/sonar/test-execution.xml
  eslint_report
}

# `|| true`: a non-zero exit here means ESLint found problems, which is exactly
# what we want imported into Sonar. `npm run lint` is the gate that fails on it.
eslint_report() {
  mkdir -p reports/eslint
  npx eslint src/ -f json -o reports/eslint/eslint-report.json || true
}

sonar_scan() {
  [ -f "$TOKEN_FILE" ] || fail "token ausente; rode 'npm run sonar:bootstrap' primeiro."
  [ -f coverage/lcov.info ] || log 'AVISO: coverage/lcov.info ausente — a análise reportará 0 % de cobertura.'
  [ -f reports/eslint/eslint-report.json ] || eslint_report

  log 'executando o scanner...'
  # Runs on the compose network and addresses the server by its service name,
  # so the scanner does not depend on how the host publishes port 9000.
  run_scanner || {
    # One retry, and only one: a scan that fails twice is a real failure, and
    # retrying past that would turn the gate into something people re-run until
    # it goes green.
    log 'scanner falhou; aguardando 15s e tentando uma segunda vez...'
    sleep 15
    run_scanner || fail 'o scanner falhou duas vezes.'
  }

  node scripts/sonar-report.mjs
}

run_scanner() {
  docker run --rm \
    --network "$SONAR_NETWORK" \
    -e SONAR_HOST_URL='http://sonarqube:9000' \
    -e SONAR_TOKEN="$(cat "$TOKEN_FILE")" \
    -v "$(pwd):/usr/src" \
    "$SCANNER_IMAGE"
}

sonar_report() {
  node scripts/sonar-report.mjs
}

sonar_down() {
  docker compose -f "$SONAR_COMPOSE" down
}

sonar_reset() {
  docker compose -f "$SONAR_COMPOSE" down -v
  rm -rf "$SONAR_STATE_DIR"
  log 'stack e volumes removidos; a próxima execução refaz o bootstrap do zero.'
}

case "${1:-all}" in
  up) sonar_up ;;
  bootstrap) sonar_bootstrap ;;
  reports) sonar_reports ;;
  scan) sonar_scan ;;
  report) sonar_report ;;
  down) sonar_down ;;
  reset) sonar_reset ;;
  all)
    sonar_up
    sonar_bootstrap
    sonar_reports
    sonar_scan
    ;;
  *) fail "subcomando desconhecido: $1" ;;
esac
