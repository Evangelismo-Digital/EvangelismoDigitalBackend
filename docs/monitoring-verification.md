# Monitoring Stack Verification (Step 20)

Runbook for validating the full observability stack (Prometheus, Alertmanager, Grafana, exporters)
end-to-end against the containerized prod app/worker — the closing step of
[monitoring-implementation-steps.md](monitoring-implementation-steps.md). Pairs with
[scripts/verify-monitoring.sh](../scripts/verify-monitoring.sh), which automates everything that can be
checked from the command line; this doc covers what that script cannot (browser UIs, inbox checks).

## Prerequisites

- Docker daemon running; `jq` and `curl` installed on the host.
- Node matching `.nvmrc` with dependencies installed (`npm ci`) — the script now runs typecheck/lint/
  unit/e2e directly on the host before touching Docker.
- `.env` filled in with real values (copy from `.env.example` if needed) — at minimum
  `GRAFANA_ADMIN_PASSWORD`, `POSTGRES_*`, `REDIS_PASSWORD`, `SMTP_*`, `ADMIN_EMAIL`. Optionally
  `ALERTMANAGER_WEBHOOK_URL` / `WATCHDOG_HEARTBEAT_URL` (empty disables those channels — see
  [alertmanager/alertmanager.yml.tmpl](../alertmanager/alertmanager.yml.tmpl)).
- Ports `3333` (API) and `3001` (Grafana) free on the host.

## 1. Automated

```bash
bash scripts/verify-monitoring.sh
```

Runs, in order: **typecheck, lint, `test:unit:all`, `test:e2e`** (against the independent dev
`docker-compose.yml` stack, brought up first — this is why it runs before the prod stack, avoiding any
port-3333 conflict); then brings up `docker-compose.prod.yml` + `docker-compose.monitoring.yml` and
checks metrics endpoints reachable, no duplicate metric names, all Prometheus scrape targets UP, all
alert rules loaded with no errors (Watchdog firing), Alertmanager config valid, a full alert smoke test
(`BackendApiDown` fires then resolves after stopping/restarting `fastify-backend`), and Grafana healthy
with the Prometheus datasource provisioned. Exits non-zero on the first failing stage. Leaves the stack
running afterward for the manual checks below.

This script intentionally does **not** run the *full* `npm run ci:local` pipeline — security/license
scanners (gitleaks, semgrep, osv-scanner, trivy), coverage reporting, and its own separate Docker image
build+smoke test stay a heavier, still-recommended pre-push gate, run separately.

## 2. Manual — Grafana dashboards

1. Generate some data first: browse a few API routes, and let a mail job run (or trigger one) so the
   email/outbox panels aren't empty.
2. Open `http://localhost:3001` (`admin` / `$GRAFANA_ADMIN_PASSWORD`).
3. Confirm all 5 dashboards from Step 18 load and show real data (not "No data"):
   - **NodeJS Application** (11159) — heap, GC, event loop, CPU for both `fastify-api` and
     `fastify-worker` jobs.
   - **Redis Dashboard for Prometheus Redis Exporter** (763).
   - **PostgreSQL Database** (9628) — connections, cache hit; query-stat panels need
     `pg_stat_statements` (enabled in Step 18) and some real query traffic.
   - **Fastify HTTP & BullMQ** (custom) — HTTP rate/latency, BullMQ job states, email/outbox/provider
     panels.
   - **Database internals** (custom) — connections, commits/rollbacks, cache-hit ratio, deadlocks,
     long-running transactions, top queries by total time.

## 3. Manual — Prometheus / Alertmanager UIs

These are internal-only (not published to the host). Either SSH-tunnel from the VPS or use
`docker compose exec`:

```bash
# Via docker compose exec (from the repo root, stack already up):
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml exec prometheus \
  wget -qO- http://localhost:9090/api/v1/status/config

# Or tunnel (replace user@host with the VPS):
ssh -L 9090:localhost:9090 -L 9093:localhost:9093 user@host
# then open http://localhost:9090/targets, /alerts, and http://localhost:9093/#/status
```

Confirm visually: all scrape targets green, all alert rules loaded, Alertmanager status page shows the
rendered config with no errors.

## 4. Manual — Alert notification delivery

The automated script proves Prometheus/Alertmanager **state** transitions correctly
(`BackendApiDown` inactive → firing → resolved) but not that a human actually receives the
notification. After running the script:

- Check the inbox at `ADMIN_EMAIL` for the `BackendApiDown` firing email and its resolved follow-up.
- If `ALERTMANAGER_WEBHOOK_URL` is configured, confirm the webhook endpoint received both events.
- If `WATCHDOG_HEARTBEAT_URL` is configured (e.g. Healthchecks.io), confirm it shows continuous
  check-ins (the Watchdog alert pings it every minute — see
  [prometheus/alerts.yml](../prometheus/alerts.yml)).

## Success criteria

- [ ] Typecheck, lint, `test:unit:all`, `test:e2e` pass (`scripts/verify-monitoring.sh` first stage).
- [ ] All Prometheus scrape targets UP.
- [ ] All alert rules loaded without errors; Watchdog firing continuously.
- [ ] Alertmanager config valid, all 4 receivers present.
- [ ] Alert smoke test fires and resolves (`scripts/verify-monitoring.sh` stage 8).
- [ ] Alert email (and webhook, if configured) actually received.
- [ ] All 5 Grafana dashboards render with real data.
- [ ] No duplicate metric names in `/metrics` output.
- [ ] Full `npm run ci:local` passes before pushing (security/license scanners, coverage — separate,
      heavier gate not duplicated by this script).

## Teardown

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml down
```
