#!/usr/bin/env bash
# End-to-end verification of the monitoring stack (Prometheus, Alertmanager,
# Grafana, exporters) against the containerized prod app/worker — Step 20 of
# docs/monitoring-implementation-steps.md. Companion runbook for the manual/
# visual checks this script can't automate: docs/monitoring-verification.md.
#
# Runs typecheck/lint/unit/e2e first (before any prod container exists, so
# ci-local.sh's own port-3333 guard never collides with our stack). It does
# NOT run the full `npm run ci:local` pipeline — security/license scanners,
# coverage, and its own separate Docker image build+smoke test stay a
# separate, still-recommended pre-push gate.
#
# Requires: Docker (daemon running), jq, curl, Node per .nvmrc with deps
# installed (npm ci), a populated .env.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml)

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

fail() {
  printf '\033[1;31mERRO: %s\033[0m\n' "$1" >&2
  exit 1
}

# .env is docker --env-file format: unquoted, values may contain spaces, so it
# must NOT be `source`d (same convention as scripts/ci-local.sh).
env_var() { grep -m1 "^$1=" .env | cut -d= -f2-; }

# Restores fastify-backend if the alert-smoke stage leaves it stopped (e.g. the
# script errors mid-wait). Runs on every exit, success or failure.
BACKEND_STOPPED=0
restore_backend() {
  if [ "$BACKEND_STOPPED" = "1" ]; then
    echo 'Restaurando fastify-backend (trap de saída)...' >&2
    "${COMPOSE[@]}" start fastify-backend >/dev/null 2>&1 || true
  fi
}
trap restore_backend EXIT

# Fetches /metrics from inside an app container (ports 9091/9092 are internal
# to the compose network, not published to the host) via the same node -e HTTP
# idiom the healthchecks use, since node:22-slim has no curl/wget.
fetch_app_metrics() {
  local svc="$1" port="$2"
  "${COMPOSE[@]}" exec -T "$svc" node -e "
    require('http').get('http://localhost:${port}/metrics', (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { process.stdout.write(d); process.exit(0); });
    }).on('error', (e) => { console.error(e.message); process.exit(1); });
  "
}

# ─────────────────────────────────────────────────────────────────────────────
stage 'Preflight'
command -v jq >/dev/null 2>&1 || fail 'jq não encontrado (necessário para este script).'
command -v curl >/dev/null 2>&1 || fail 'curl não encontrado (necessário para este script).'
docker info >/dev/null 2>&1 || fail 'Docker daemon não está acessível.'
[ -f .env ] || fail '.env não encontrado — copie de .env.example e preencha os segredos reais antes de rodar este script.'

GRAFANA_ADMIN_PASSWORD="$(env_var GRAFANA_ADMIN_PASSWORD)"
[ -n "$GRAFANA_ADMIN_PASSWORD" ] || fail 'GRAFANA_ADMIN_PASSWORD vazio em .env.'

for port in 3333 3001; do
  if curl -sf "http://localhost:${port}" >/dev/null 2>&1 || curl -sf "http://localhost:${port}/health/" >/dev/null 2>&1; then
    echo "AVISO: já existe algo respondendo em localhost:${port}; pode ser este mesmo stack de uma execução anterior." >&2
  fi
done
stage_done 'Preflight'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Testes (typecheck, lint, unit, e2e)'
EXPECTED_NODE=$(cat .nvmrc | tr -d 'v[:space:]')
ACTUAL_NODE=$(node --version | tr -d 'v')
if [ "$EXPECTED_NODE" != "$ACTUAL_NODE" ]; then
  echo "AVISO: Node local é v${ACTUAL_NODE}, mas .nvmrc pede v${EXPECTED_NODE}." >&2
fi

# Dev db/redis — independent of the prod+monitoring stack brought up below
# (different container names, prod publishes no db/redis host ports).
docker compose up -d --wait
npx prisma generate
npx prisma migrate deploy

npm run typecheck
npm run lint
npm run test:unit:all
npm run test:e2e
stage_done 'Testes'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Subindo o stack (prod + monitoring)'
"${COMPOSE[@]}" up -d --build --wait
stage_done 'Stack up'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Endpoints de métricas acessíveis'
curl -sf http://localhost:3333/health/ >/dev/null || fail 'fastify-backend :3333/health/ não respondeu.'

API_METRICS="$(fetch_app_metrics fastify-backend 9091)"
[ -n "$API_METRICS" ] || fail 'fastify-backend :9091/metrics veio vazio.'
echo "fastify-backend :9091/metrics — $(echo "$API_METRICS" | grep -c '^[^#]') linhas de amostra"

WORKER_METRICS="$(fetch_app_metrics fastify-worker 9092)"
[ -n "$WORKER_METRICS" ] || fail 'fastify-worker :9092/metrics veio vazio.'
echo "fastify-worker :9092/metrics — $(echo "$WORKER_METRICS" | grep -c '^[^#]') linhas de amostra"
stage_done 'Endpoints de métricas'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Sem nomes de métrica duplicados'
# A "# TYPE <name> <type>" line is emitted once per registered metric family;
# a duplicate here means a metric was registered twice (real bug), unlike
# repeated sample lines with different label sets, which are normal.
DUP_NAMES="$(echo "$API_METRICS" | grep '^# TYPE ' | awk '{print $3}' | sort | uniq -d)"
[ -z "$DUP_NAMES" ] || fail "Nomes de métrica duplicados em fastify-backend: $DUP_NAMES"
DUP_NAMES_WORKER="$(echo "$WORKER_METRICS" | grep '^# TYPE ' | awk '{print $3}' | sort | uniq -d)"
[ -z "$DUP_NAMES_WORKER" ] || fail "Nomes de métrica duplicados em fastify-worker: $DUP_NAMES_WORKER"
stage_done 'Sem duplicatas'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Prometheus: todos os targets UP'
EXPECTED_JOBS='alertmanager fastify-api fastify-worker node-exporter postgresql prometheus redis'
TARGETS_JSON=''
TARGETS_OK=0
for _ in $(seq 1 8); do
  TARGETS_JSON="$("${COMPOSE[@]}" exec -T prometheus wget -qO- http://localhost:9090/api/v1/targets)"
  DOWN="$(echo "$TARGETS_JSON" | jq -r '.data.activeTargets[] | select(.health!="up") | .labels.job')"
  GOT_JOBS="$(echo "$TARGETS_JSON" | jq -r '.data.activeTargets[].labels.job' | sort -u | tr '\n' ' ' | sed 's/ $//')"
  if [ -z "$DOWN" ] && [ "$GOT_JOBS" = "$EXPECTED_JOBS" ]; then
    TARGETS_OK=1
    break
  fi
  echo "Aguardando targets ficarem UP (scrape_interval=30s)... jobs down: [${DOWN:-none}]"
  sleep 8
done
[ "$TARGETS_OK" = "1" ] || fail "Nem todos os targets do Prometheus subiram. Esperado jobs: [$EXPECTED_JOBS]; obtido: [$GOT_JOBS]; down: [$DOWN]"
echo "Todos os targets UP: [$GOT_JOBS]"
stage_done 'Targets UP'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Prometheus: regras de alerta carregadas'
RULES_JSON=''
RULES_OK=0
for _ in $(seq 1 4); do
  RULES_JSON="$("${COMPOSE[@]}" exec -T prometheus wget -qO- http://localhost:9090/api/v1/rules)"
  N_GROUPS="$(echo "$RULES_JSON" | jq '.data.groups | length')"
  N_RULES="$(echo "$RULES_JSON" | jq '[.data.groups[].rules[]] | length')"
  N_ERR="$(echo "$RULES_JSON" | jq '[.data.groups[].rules[] | select(.health=="err")] | length')"
  WATCHDOG_STATE="$(echo "$RULES_JSON" | jq -r '[.data.groups[].rules[] | select(.name=="Watchdog") | .state] | first // "missing"')"
  if [ "$N_ERR" = "0" ] && [ "$WATCHDOG_STATE" = "firing" ] && [ "$N_GROUPS" -ge 1 ] && [ "$N_RULES" -ge 1 ]; then
    RULES_OK=1
    break
  fi
  echo "Aguardando avaliação das regras (evaluation_interval=15s)... watchdog=$WATCHDOG_STATE, erros=$N_ERR"
  sleep 8
done
[ "$RULES_OK" = "1" ] || fail "Regras não carregaram corretamente: grupos=$N_GROUPS, regras=$N_RULES, erros=$N_ERR, watchdog=$WATCHDOG_STATE"
echo "Regras carregadas: $N_GROUPS grupos, $N_RULES regras, 0 erros, Watchdog=firing"
stage_done 'Regras de alerta'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Alertmanager: configuração carregada'
AM_CHECK="$("${COMPOSE[@]}" exec -T alertmanager amtool check-config /alertmanager/alertmanager.rendered.yml 2>&1)" \
  || fail "amtool check-config falhou:\n$AM_CHECK"
echo "$AM_CHECK" | grep -q 'SUCCESS' || fail "amtool não reportou SUCCESS:\n$AM_CHECK"
echo "$AM_CHECK" | grep -qE '[0-9]+ receivers' || fail "amtool não reportou receivers:\n$AM_CHECK"
echo "$AM_CHECK" | grep -E 'SUCCESS|receivers|inhibit'
stage_done 'Alertmanager config'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Teste de fumaça de alerta (BackendApiDown)'
echo 'Parando fastify-backend...'
"${COMPOSE[@]}" stop fastify-backend >/dev/null
BACKEND_STOPPED=1

FIRING=0
# Worst case: up to scrape_interval(30s) to detect down + for:2m pending +
# evaluation_interval(15s) margin ≈ 165s. Poll with margin: 14 * 15s = 210s.
for i in $(seq 1 14); do
  STATE="$("${COMPOSE[@]}" exec -T prometheus wget -qO- http://localhost:9090/api/v1/alerts \
    | jq -r '[.data.alerts[] | select(.labels.alertname=="BackendApiDown")] | first.state // "none"')"
  echo "[$((i*15))s] BackendApiDown: $STATE"
  if [ "$STATE" = "firing" ]; then
    FIRING=1
    break
  fi
  sleep 15
done
[ "$FIRING" = "1" ] || fail 'BackendApiDown não disparou (state=firing) dentro do tempo esperado.'
echo 'BackendApiDown disparou como esperado.'

echo 'Reiniciando fastify-backend...'
"${COMPOSE[@]}" start fastify-backend >/dev/null
BACKEND_STOPPED=0

RESOLVED=0
for i in $(seq 1 14); do
  STATE="$("${COMPOSE[@]}" exec -T prometheus wget -qO- http://localhost:9090/api/v1/alerts \
    | jq -r '[.data.alerts[] | select(.labels.alertname=="BackendApiDown")] | first.state // "resolved"')"
  echo "[$((i*15))s] BackendApiDown: $STATE"
  if [ "$STATE" = "resolved" ]; then
    RESOLVED=1
    break
  fi
  sleep 15
done
[ "$RESOLVED" = "1" ] || fail 'BackendApiDown não voltou a resolved dentro do tempo esperado.'
curl -sf http://localhost:3333/health/ >/dev/null || fail 'fastify-backend não voltou a responder em :3333/health/ após o restart.'
echo 'BackendApiDown resolveu e a API voltou a responder.'
stage_done 'Teste de fumaça de alerta'

# ─────────────────────────────────────────────────────────────────────────────
stage 'Grafana acessível'
GRAFANA_HEALTH="$(curl -sf http://localhost:3001/api/health)" || fail 'Grafana :3001/api/health não respondeu.'
echo "$GRAFANA_HEALTH" | jq -e '.database=="ok"' >/dev/null || fail "Grafana database não está ok: $GRAFANA_HEALTH"

DS="$(curl -sf -u "admin:${GRAFANA_ADMIN_PASSWORD}" http://localhost:3001/api/datasources)" \
  || fail 'Falha ao autenticar/consultar /api/datasources no Grafana.'
echo "$DS" | jq -e '[.[] | select(.type=="prometheus")] | length >= 1' >/dev/null \
  || fail "Datasource Prometheus não encontrado: $DS"
echo 'Grafana healthy e datasource Prometheus provisionado.'
stage_done 'Grafana'

# ─────────────────────────────────────────────────────────────────────────────
printf '\n\033[1;32m━━━ Verificação de monitoramento: todas as etapas passaram ━━━\033[0m\n'
for t in "${STAGE_TIMES[@]}"; do
  echo "  $t"
done

cat <<'EOF'

Etapas automatizadas concluídas. Restam as verificações manuais — veja
docs/monitoring-verification.md:
  - Grafana (http://localhost:3001): confirmar que os 5 dashboards populam com
    dados reais (gere tráfego HTTP e um job de e-mail antes de checar).
  - Prometheus/Alertmanager UIs internas (via túnel SSH ou docker compose
    exec): /targets, /alerts, Alertmanager /#/status.
  - Confirmar que o e-mail do teste de fumaça (BackendApiDown) chegou em
    ADMIN_EMAIL (e no webhook, se configurado) — este script só prova o
    estado do Prometheus/Alertmanager, não a entrega de terceiros.
  - `npm run ci:local` completo (scanners de segurança/licença, coverage,
    build Docker próprio) antes de um push — não duplicado aqui.

Stack deixado em execução para as checagens manuais. Ao terminar:
  docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml down
EOF
