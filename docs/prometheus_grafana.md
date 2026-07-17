# Implement Prometheus, Grafana & Alertmanager Monitoring

Comprehensive observability for the EvangelismoDigitalBackend — covering application metrics, infrastructure exporters, alerting, and pre-built dashboards.

> **Deferred**: Loki + Promtail (centralized log aggregation) excluded to reduce memory pressure on the VPS. Sentry covers error tracking in the interim. Loki can be added in a future phase when moving to a larger instance (4 GB+ RAM recommended).

---

## Pinned Versions 

| Tool                          | Version        |
|-------------------------------|----------------|
| Prometheus                    | latest stable |
| Grafana                       | latest stable |
| Alertmanager                  | latest stable |
| Redis Exporter                | latest stable |
| PostgreSQL Exporter           | latest stable |
| Node Exporter                 | latest stable |

| prom-client                   | latest stable |
| fastify-metrics               | latest stable |

---

## Port Map (No Collisions)

| Service              | Internal Port | Host Port | Notes                               |
|----------------------|---------------|-----------|-------------------------------------|
| Fastify API          | 3000          | 3000      | Public API traffic                  |
| Fastify API Metrics  | 9091          | —         | Internal only, not published        |
| Fastify Worker Metrics | 9092        | —         | Internal only, not published        |
| Prometheus           | 9090          | —         | Internal only, not published        |
| Alertmanager         | 9093          | —         | Internal only, not published        |
| Grafana              | 3000          | 3001      | Public (uses login screen)          |
| Redis Exporter       | 9121          | —         | Internal only                       |
| PostgreSQL Exporter  | 9187          | —         | Internal only                       |
| Node Exporter        | 9100          | —         | Internal only                       |


---

## Docker Networks

Two internal Docker networks:

- **`app`** — connects Fastify, PostgreSQL, and Redis (existing `evangelismo-network`).
- **`monitoring`** — connects Fastify, Prometheus, Alertmanager, Grafana, and all exporters.

The Fastify backend containers must join **both** networks. Metrics ports (`9091`, `9092`) must **not** be published to the host.

---

## File & Directory Layout

```
EvangelismoDigitalBackend/
├── docker-compose.yml                          # Core: PostgreSQL, Redis (unchanged)
├── docker-compose.monitoring.yml               # NEW: Prometheus, Grafana, Alertmanager, exporters

├── prometheus/
│   ├── prometheus.yml                          # NEW: Scrape config (8 targets)
│   └── alerts.yml                             # NEW: Alert rules
├── alertmanager/
│   └── alertmanager.yml                       # NEW: Email notification routing
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── prometheus.yml                 # NEW: Auto-provision datasource
│   │   └── dashboards/
│   │       └── dashboards.yml                 # NEW: Dashboard file provider
│   └── dashboards/
│       ├── node-js-application-11159.json     # NEW: Community dashboard
│       ├── redis-763.json                     # NEW: Community dashboard
│       ├── postgresql-9628.json               # NEW: Community dashboard
│       ├── fastify-http-bullmq.json           # NEW: Custom dashboard
│       └── prisma-database.json               # NEW: Custom dashboard
├── src/
│   ├── lib/
│   │   └── metrics/
│   │       ├── index.ts                       # NEW: Registry singleton + collectDefaultMetrics
│   │       ├── cache-metrics.ts               # NEW: ResilientCache counters/gauges
│   │       ├── lock-metrics.ts                # NEW: DistributedLock counters
│   │       ├── rate-limiter-metrics.ts         # NEW: RedisRateLimiter counters
│   │       ├── outbox-metrics.ts              # NEW: Outbox pipeline counters
│   │       ├── provider-metrics.ts            # NEW: Geo/Address/Church provider counters
│   │       ├── bullmq-metrics.ts              # NEW: Queue state gauges
│   │       └── email-metrics.ts               # NEW: Email dispatch counters
│   ├── metrics-server.ts                      # NEW: Dedicated Fastify instance for /metrics
│   ├── server.ts                              # MODIFY: Start metrics server on :9091
│   ├── worker.ts                              # MODIFY: Start metrics server on :9092
│   ├── app.ts                                 # MODIFY: Register fastify-metrics plugin
│   ├── env/index.ts                           # MODIFY: Add METRICS_ENABLED, METRICS_PORT_*
│   └── http/plugins/
│       └── memory-monitor.plugin.ts           # DELETE: Replaced by prom-client defaults + alerts
```

---

## Proposed Changes

### 1. Environment Configuration

#### [MODIFY] [index.ts](file:///home/amaro/EvangelismoDigitalBackend/src/env/index.ts)

Add environment variables to the Zod schema:

```typescript
// Metrics
METRICS_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
METRICS_API_PORT: z.coerce.number().default(9091),
METRICS_WORKER_PORT: z.coerce.number().default(9092),

// Grafana (used in docker-compose.monitoring.yml)
GRAFANA_ADMIN_PASSWORD: z.string().min(8),
```

Add to `.env.example`:

```env
# Metrics
METRICS_ENABLED=true
METRICS_API_PORT=9091
METRICS_WORKER_PORT=9092
GRAFANA_ADMIN_PASSWORD=changeme_in_production
```

Override in `.env.test`:

```env
METRICS_ENABLED=false
```

---

### 2. Metrics Registry & Custom Metrics

> [!CAUTION]
> **High Cardinality Protection Rules**:
> Label values in Prometheus generate a new time series for every unique combination. To prevent memory exhaustion and disk space blowout:
> - **Never** pass dynamic IDs, tokens, UUIDs, IPs, or user-specific inputs directly as label values (e.g. `distributed_lock_acquired_total{key="lock:user:123"}`).
> - **Always** sanitize dynamic keys or parameters to their high-level category before recording metrics (e.g., replace `lock:user:123` with a static value like `lock:user`, or strip variable suffixes).
> - All cache prefixes, outbox locks, and providers in this application currently use strict constants (e.g., `lock:outbox-processor`, `cache:cep-coords:`), which are safe. Any future dynamic instrumentation must comply with this rule.

#### [NEW] `src/lib/metrics/index.ts`

Central registry module:

- Imports `prom-client`.
- Calls `collectDefaultMetrics()` (Node.js process metrics: heap, GC, event loop lag, CPU).
- Exports the default `Registry` for the metrics server to call `register.metrics()`.
- Only initializes when `METRICS_ENABLED=true`.

#### [NEW] `src/lib/metrics/cache-metrics.ts`

Metrics for [resilient-cache.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/cache/resilient-cache.ts):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cache_hits_total` | Counter | `prefix` | Cache envelope found in Redis (hit) |
| `cache_misses_total` | Counter | `prefix` | Cache miss → fetcher invoked |
| `cache_errors_total` | Counter | `prefix`, `error_type` | Redis read/write errors, corrupted envelopes |
| `cache_pending_fetches` | Gauge | `prefix` | Current `pendingFetches.size` (circuit-breaker gauge) |
| `cache_fetch_duration_seconds` | Histogram | `prefix` | Duration of the fetcher call (excl. Redis read) |
| `cache_circuit_breaker_trips_total` | Counter | `prefix` | Times `pendingFetches >= MAX_PENDING` |

#### [NEW] `src/lib/metrics/lock-metrics.ts`

Metrics for [distributed-lock.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/distributed-lock/distributed-lock.ts):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `distributed_lock_acquired_total` | Counter | `key` | Successful lock acquisitions |
| `distributed_lock_contention_total` | Counter | `key` | Failed acquisitions (lock held by another) |
| `distributed_lock_released_total` | Counter | `key` | Successful releases |
| `distributed_lock_expired_total` | Counter | `key` | Release/renew found lock expired |
| `distributed_lock_duration_seconds` | Histogram | `key` | Time between acquire and release |

#### [NEW] `src/lib/metrics/rate-limiter-metrics.ts`

Metrics for [redis-rate-limiter.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/rate-limiter/redis-rate-limiter.ts):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `rate_limiter_consumed_total` | Counter | `provider` | Successful consume (point granted) |
| `rate_limiter_rejected_total` | Counter | `provider` | Rate limit exceeded (no points remaining) |
| `rate_limiter_infra_degraded_total` | Counter | `provider` | Fail-open events (Redis down, traffic allowed) |
| `rate_limiter_infra_recovered_total` | Counter | `provider` | Recovery from degraded state |

#### [NEW] `src/lib/metrics/outbox-metrics.ts`

Metrics for [outbox-processor.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-processor.ts), [outbox-cron.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-cron.ts), and [outbox-signal.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/events/outbox-signal.ts):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `outbox_events_dispatched_total` | Counter | — | Events successfully dispatched to BullMQ |
| `outbox_events_reverted_total` | Counter | — | Events reverted to PENDING after dispatch failure |
| `outbox_events_stuck_recovered_total` | Counter | — | Stuck SENDING events recovered by cron |
| `outbox_cron_runs_total` | Counter | `phase` | Cron executions (`recovery`, `pending`) |
| `outbox_signal_published_total` | Counter | — | Pub/Sub signals published |
| `outbox_signal_publish_failed_total` | Counter | — | Pub/Sub publish failures (Redis down) |

#### [NEW] `src/lib/metrics/provider-metrics.ts`

Metrics for [resilient-address-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/resilient-address-provider.ts), [resilient-geo-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/geo-provider/resilient-geo-provider.ts), and church routing providers:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `provider_request_total` | Counter | `provider`, `layer`, `result` | Per-provider request outcomes (`success`, `not_found`, `retryable`, `fatal`) |
| `provider_fallback_total` | Counter | `layer`, `from_provider`, `to_provider` | Fallback transitions between providers |
| `provider_chain_exhausted_total` | Counter | `layer` | All providers in a chain failed |
| `provider_latency_seconds` | Histogram | `provider`, `layer` | Individual provider response time |

Labels: `layer` = `address` | `geocoding` | `routing`

#### [NEW] `src/lib/metrics/bullmq-metrics.ts`

Metrics for BullMQ queue state (lazy-collected on scrape):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `bullmq_jobs` | Gauge | `queue`, `state` | Current job count by state (`waiting`, `active`, `completed`, `failed`, `delayed`) |

Exports a `collectBullMQMetrics()` function that calls `queue.getJobCounts()` — invoked lazily on each Prometheus scrape, not on a timer, to avoid unnecessary Redis load.

#### [NEW] `src/lib/metrics/email-metrics.ts`

Metrics for [mail-worker.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/workers/mail-worker.ts):

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `emails_sent_total` | Counter | — | Emails successfully sent via SMTP |
| `emails_failed_total` | Counter | `error_type` | Email send failures (`smtp`, `infra`, `idempotency`) |
| `email_batch_duration_seconds` | Histogram | — | Duration to process a mail job batch |

---

### 3. Metrics Server

#### [NEW] [metrics-server.ts](file:///home/amaro/EvangelismoDigitalBackend/src/metrics-server.ts)

Create a secondary Fastify instance. It must:

- Bind to `0.0.0.0` on a configurable port (`METRICS_API_PORT` or `METRICS_WORKER_PORT`).
- Expose a single `GET /metrics` route.
- Register a custom Counter: `metrics_collection_errors_total` with label `source` (`bullmq` or `prisma`).
- On each request, protect against hanging upstream services (PostgreSQL/Redis) that could block the entire scrape:
  1. Trigger `collectBullMQMetrics()` (lazy gauge collection) wrapped in a `Promise.race` with a 2-second timeout (since it performs async Redis checks to update gauges in the registry). If it times out or fails, increment `metrics_collection_errors_total{source="bullmq"}`, log a warning, and proceed.
  2. Concurrently resolve text-based metrics using `Promise.allSettled`. This includes `register.metrics()` (which is asynchronous and returns a `Promise<string>` in `prom-client` v14+) and `prisma.$metrics.prometheus()` (if `includePrisma` is true, which returns a `Promise<string>`). Wrap both in their own 2-second timeout helpers.
  3. If a promise in `Promise.allSettled` fails or times out, increment `metrics_collection_errors_total` with the corresponding label (`source="prom-client"` or `source="prisma"`), log a warning, and ignore the failed chunk.
  4. Filter the successfully fulfilled promise results, extract their string contents, concatenate them separated by double newlines (`\n\n`), and return the aggregated plain-text metrics.
  5. Set `Content-Type` to `text/plain; version=0.0.4; charset=utf-8`.
- Expose a `GET /health` route returning `200 OK` for Docker healthchecks.
- Accept an optional Prisma client parameter (null for worker, since worker doesn't use Prisma directly for metrics).
- Guard startup behind `METRICS_ENABLED` check.

#### [MODIFY] [server.ts](file:///home/amaro/EvangelismoDigitalBackend/src/server.ts)

After the main Fastify app starts on `:3000`, start the metrics server on `METRICS_API_PORT` (`:9091`).

```typescript
import { startMetricsServer } from './metrics-server'

// Inside start()
await app.listen({ host: '0.0.0.0', port: env.APP_PORT })
await startMetricsServer({ port: env.METRICS_API_PORT, includePrisma: true })
```

Add metrics server to graceful shutdown in `closeWithGrace`. The metrics server must close **last** in the shutdown sequence (after the main API server closes and DB/Redis clients disconnect) so telemetry remains scraped during the shutdown procedure.

#### [MODIFY] [worker.ts](file:///home/amaro/EvangelismoDigitalBackend/src/worker.ts)

After worker bootstrap, start the metrics server on `METRICS_WORKER_PORT` (`:9092`).

```typescript
import { startMetricsServer } from './metrics-server'

// Inside bootstrap()
await startMetricsServer({ port: env.METRICS_WORKER_PORT, includePrisma: false })
```

Add metrics server to worker cleanup/shutdown handler. It must close **last** (after BullMQ queues and workers are paused/closed and Redis disconnects) to ensure metrics are visible throughout the shutdown sequence.

---

### 4. Fastify HTTP Metrics Plugin

#### [MODIFY] [app.ts](file:///home/amaro/EvangelismoDigitalBackend/src/app.ts)

Register `fastify-metrics` plugin:

```typescript
import metricsPlugin from 'fastify-metrics'

// After asyncContext, before routes
app.register(metricsPlugin, {
  endpoint: null,        // Do NOT expose /metrics on :3000
  defaultMetrics: false, // We handle this in metrics/index.ts
})
```

> **Fallback**: If Fastify 5 compatibility issues arise, replace with a manual `onResponse` hook recording into a `prom-client` Histogram (`http_request_duration_seconds` with labels `method`, `route`, `status_code`).

---

### 5. Deprecate Memory Monitor

#### [DELETE] [memory-monitor.plugin.ts](file:///home/amaro/EvangelismoDigitalBackend/src/http/plugins/memory-monitor.plugin.ts)

Remove the `setInterval`-based heap monitoring. Replaced by:

- `prom-client` `collectDefaultMetrics()` → exposes `process_heap_used_bytes`, `process_resident_memory_bytes`.
- Prometheus alert `HighHeapMemoryUsage` → fires at 85% heap usage.
- Grafana Node.js dashboard → visualizes memory trends.

#### [MODIFY] [app.ts](file:///home/amaro/EvangelismoDigitalBackend/src/app.ts)

Remove `import { memoryMonitor }` and `app.register(memoryMonitor)`.

---

### 6. Instrument Existing Subsystems

Each subsystem file gets minimal changes — importing its metric module and calling `counter.inc()` or `histogram.observe()` at the appropriate points.

#### [MODIFY] [resilient-cache.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/cache/resilient-cache.ts)

- On Redis cache hit → `cacheHits.inc({ prefix })`
- On cache miss (fetcher invoked) → `cacheMisses.inc({ prefix })`
- On Redis read/write error → `cacheErrors.inc({ prefix, error_type })`
- Update `cachePendingFetches` gauge on set/delete from `pendingFetches` map.
- On circuit breaker trip → `cacheCircuitBreakerTrips.inc({ prefix })`
- Wrap fetcher call with histogram timer.

#### [MODIFY] [distributed-lock.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/distributed-lock/distributed-lock.ts)

- On `acquire` success → `lockAcquired.inc({ key })`
- On `acquire` returns null → `lockContention.inc({ key })`
- On `release` success → `lockReleased.inc({ key })`
- On `release`/`renew` expired → `lockExpired.inc({ key })`
- Track duration between acquire and release.

#### [MODIFY] [redis-rate-limiter.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/rate-limiter/redis-rate-limiter.ts)

- On `tryConsume` success → `rateLimiterConsumed.inc({ provider })`
- On rate limit exceeded → `rateLimiterRejected.inc({ provider })`
- On `logInfraDegraded` → `rateLimiterInfraDegraded.inc({ provider })`
- On `logInfraRecoveryIfNeeded` → `rateLimiterInfraRecovered.inc({ provider })`

#### [MODIFY] [outbox-processor.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-processor.ts)

- After successful `dispatchToBullMQ` → `outboxDispatched.inc()`
- On revert to PENDING → `outboxReverted.inc()`
- On stuck recovery → `outboxStuckRecovered.inc()`

#### [MODIFY] [outbox-cron.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/jobs/outbox-cron.ts)

- On cron Phase 1 start → `outboxCronRuns.inc({ phase: 'recovery' })`
- On cron Phase 2 start → `outboxCronRuns.inc({ phase: 'pending' })`

#### [MODIFY] [outbox-signal.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/infra/events/outbox-signal.ts)

- On successful publish → `outboxSignalPublished.inc()`
- On publish failure → `outboxSignalPublishFailed.inc()`

#### [MODIFY] [resilient-address-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/address-provider/resilient-address-provider.ts)

- On each provider attempt → `providerRequest.inc({ provider, layer: 'address', result })`
- On fallback to next provider → `providerFallback.inc({ layer: 'address', from_provider, to_provider })`
- On chain exhaustion → `providerChainExhausted.inc({ layer: 'address' })`
- Wrap each provider call with histogram timer.

#### [MODIFY] [resilient-geo-provider.ts](file:///home/amaro/EvangelismoDigitalBackend/src/providers/geo-provider/resilient-geo-provider.ts)

Same pattern as address provider with `layer: 'geocoding'`.

#### [MODIFY] Church routing provider

Same pattern with `layer: 'routing'`.

#### [MODIFY] [mail-worker.ts](file:///home/amaro/EvangelismoDigitalBackend/src/lib/workers/mail-worker.ts)

- On batch complete (all emails sent) → `emailsSent.inc(count)`
- On SMTP failure → `emailsFailed.inc({ error_type: 'smtp' })`
- On infrastructure failure → `emailsFailed.inc({ error_type: 'infra' })`
- On idempotency skip → `emailsFailed.inc({ error_type: 'idempotency' })`
- Wrap entire job processing with histogram timer.

---

### 7. Docker Compose — Monitoring Stack

#### [NEW] `docker-compose.monitoring.yml`

Separate compose overlay with all monitoring services. Started via:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Services:

##### `prometheus` — `prom/prometheus:v3.7.3`

- Mount `prometheus/prometheus.yml` and `prometheus/alerts.yml` as read-only.
- Named volume `prometheus_data` for TSDB storage.
- Retention: 15 days and 10GB (`--storage.tsdb.retention.time=15d`, `--storage.tsdb.retention.size=10GB`).
- Enable lifecycle API (`--web.enable-lifecycle`) for hot config reloads.
- No host port publishing (accessible only internally on the `monitoring` network or via reverse proxy/SSH tunnel).
- Resource Limits: limits CPU to `0.5` cores, memory to `1GB`. Reservations: memory `256MB`.
- Healthcheck: `test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9090/-/ready"]`, interval `10s`, timeout `5s`, retries `3`.
- Restart Policy: `restart: unless-stopped`.
- Dependencies: `depends_on` the exporters (`redis-exporter`, `postgres-exporter`, `node-exporter`) and `alertmanager` to guarantee scrape targets are online when starting.
- Networks: `monitoring`.

##### `alertmanager` — `prom/alertmanager:v0.27.0`

- Mount `alertmanager/alertmanager.yml` as read-only.
- Named volume `alertmanager_data` for state persistence (silences, inhibitions).
- No host port publishing (accessible only internally).
- Resource Limits: limits CPU to `0.1` cores, memory to `128MB`.
- Healthcheck: `test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9093/-/ready"]`, interval `10s`, timeout `5s`, retries `3`.
- Restart Policy: `restart: unless-stopped`.
- Networks: `monitoring`.

##### `grafana` — `grafana/grafana:13.1.0`

- Publish on host port `3001` (internal `3000`) for public access (user selection).
- > [!WARNING]
  > **Security Warning**: Because Grafana is exposed publicly on port `3001`, enforce a very strong admin password via `GRAFANA_ADMIN_PASSWORD` (not standard passwords) and consider setting up a reverse proxy with rate limiting (like fail2ban or Caddy/Nginx limit_req) on the VPS, as Grafana has no native brute-force protection enabled by default.
- > [!IMPORTANT]
  > **Dashboard Durability / Backups**: Pre-loaded dashboards are read-only from `grafana/dashboards/*.json`. If you make custom changes or create new dashboards via the Grafana UI, they will be saved in the `grafana_data` named volume. To persist them in Git (GitOps flow), you must manually export the dashboard JSON from the UI, overwrite the local file, and commit to version control.
- Named volume `grafana_data` for Grafana state.
- Environment: `GF_USERS_ALLOW_SIGN_UP=false`, `GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}`.
- Resource Limits: limits CPU to `0.5` cores, memory to `512MB`.
- Healthcheck: `test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]`, interval `10s`, timeout `5s`, retries `3`.
- Restart Policy: `restart: unless-stopped`.
- Dependencies: `depends_on: prometheus` (ensures Prometheus is ready to receive queries).
- Networks: `monitoring`.

---

### Docker Container Log Rotation (All Services)

To prevent container logs from consuming all disk space over time, every service in `docker-compose.monitoring.yml` (and the core `docker-compose.yml`) should be configured with a strict log rotation policy:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```
This restricts logs for each container to a maximum of 30MB (3 files of 10MB each).

---

##### `redis-exporter` — `oliver006/redis_exporter:v1.73.0`

- Environment: `REDIS_ADDR=redis:6379`, `REDIS_PASSWORD=${REDIS_PASSWORD}`.
- Resource Limits: limits CPU to `0.1` cores, memory to `64MB`.
- Restart Policy: `restart: unless-stopped`.
- Networks: `monitoring`, `evangelismo-network` (to reach Redis).

##### `postgres-exporter` — `quay.io/prometheuscommunity/postgres-exporter:v0.16.0`

- Environment: `DATA_SOURCE_NAME=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=disable`.
- Resource Limits: limits CPU to `0.1` cores, memory to `64MB`.
- Restart Policy: `restart: unless-stopped`.
- Networks: `monitoring`, `evangelismo-network` (to reach PostgreSQL).

##### `node-exporter` — `prom/node-exporter:v1.9.1`

- Mount volumes to expose host directories inside the container:
  - `/proc:/host/proc:ro`
  - `/sys:/host/sys:ro`
  - `/:/rootfs:ro`
- Command flags to tell Node Exporter where to find the host resources:
  - `--path.procfs=/host/proc`
  - `--path.sysfs=/host/sys`
  - `--path.rootfs=/rootfs`
- No host port publishing (accessible only internally on `monitoring` network).
- Resource Limits: limits CPU to `0.1` cores, memory to `64MB`.
- Restart Policy: `restart: unless-stopped`.
- Networks: `monitoring`.
- `pid: host` for accurate process metrics.



---

### 8. Prometheus Configuration

#### [NEW] `prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 15s
  external_labels:
    environment: production

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  # Application metrics
  - job_name: 'fastify-api'
    static_configs:
      - targets: ['fastify-backend:9091']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'nodejs_gc_duration_seconds_bucket'
        action: drop

  - job_name: 'fastify-worker'
    static_configs:
      - targets: ['fastify-worker:9092']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'nodejs_gc_duration_seconds_bucket'
        action: drop

  # Infrastructure exporters
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']


  # Self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'alertmanager'
    static_configs:
      - targets: ['alertmanager:9093']
```

#### [NEW] `prometheus/alerts.yml`

Alert rules organized by domain:

##### Availability

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `BackendApiDown` | Scrape target `fastify-api` is down | 2 min | critical |
| `BackendWorkerDown` | Scrape target `fastify-worker` is down | 2 min | critical |
| `Watchdog` | Always active (`vector(1)`) for external heartbeat monitoring | — | critical |

##### HTTP

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `HighHttpErrorRate` | 5xx error rate > 5% over 5 min | 5 min | warning |
| `HighHttpLatencyP95` | P95 response time > 2s per route | 5 min | warning |

##### Node.js Process

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `HighHeapMemoryUsage` | heap_used / heap_total > 85% | 5 min | warning |
| `HighEventLoopLag` | Event loop lag > 500ms | 2 min | warning |

##### BullMQ

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `BullMQHighFailedJobs` | Any queue > 50 failed jobs | 5 min | warning |
| `BullMQQueueStalled` | Any queue > 500 waiting jobs | 10 min | critical |

##### Prisma / Database

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `HighDbQueryDuration` | P95 Prisma query duration > 1000ms | 5 min | warning |
| `HighDbConnectionPoolUsage` | Active query ratio > 80% | 5 min | warning |

##### Redis

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `RedisDown` | `redis_up` from redis-exporter is 0 | 1 min | critical |
| `RateLimiterFailOpen` | `rate_limiter_infra_degraded_total` increases > 10 in 5 min | 5 min | warning |
| `DistributedLockContention` | `distributed_lock_contention_total` spike | 5 min | warning |

##### Email / Outbox

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `SmtpDispatchFailure` | `emails_failed_total` increases > 5 in 10 min | 10 min | critical |
| `OutboxDispatchRevertRate` | `outbox_events_reverted_total` increases > 3 in 5 min | 5 min | warning |

##### Provider Chains

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `AddressProviderChainExhausted` | `provider_chain_exhausted_total{layer="address"}` increases | 5 min | critical |
| `GeoProviderChainExhausted` | `provider_chain_exhausted_total{layer="geocoding"}` increases | 5 min | critical |
| `ProviderHighLatency` | `provider_latency_seconds` P95 > 5s for any provider | 5 min | warning |

##### Host Infrastructure (Node Exporter)

| Alert | Condition | Duration | Severity |
|-------|-----------|----------|----------|
| `HostDiskSpaceRunningLow` | Free disk space < 10% on host mount | 5 min | critical |
| `HostCpuSaturation` | CPU usage > 90% | 10 min | warning |
| `HostMemoryRunningLow` | Available RAM < 5% of total | 5 min | critical |

---

### 9. Alertmanager Configuration

#### [NEW] `alertmanager/alertmanager.yml`

- **Global SMTP**: Reuse existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD` from `.env` (passed as Docker env vars).
- **Routes**:
  - `critical` severity → `critical-alerts` receiver (routed to email AND webhook fallback immediately).
  - `warning` severity → `warning-alerts` receiver (batched, 5 min group interval).
- **Receivers**:
  - `critical-alerts`:
    - Sends to `ADMIN_EMAIL` (via SMTP).
    - Sends to a fallback webhook (`webhook-critical`), e.g., Discord or Telegram webhook URL passed via `ALERTMANAGER_WEBHOOK_URL` env var.
  - `warning-alerts`:
    - Sends to `ADMIN_EMAIL` (SMTP), batched.
    - Sends to `webhook-warning` (Webhook) if configured, batched.
- > [!NOTE]
  > **Redundant Webhook Fallback**: To ensure alerts are delivered even if SMTP fails or the host network degrades, the webhook is configured as a secondary receiver for all critical alerts.
- **Inhibit rules**: Suppress `warning` when `critical` with same `alertname` is firing.

---

### 10. Grafana Provisioning

#### [NEW] `grafana/provisioning/datasources/prometheus.yml`

Auto-provision Prometheus as default datasource → `http://prometheus:9090`.

#### [NEW] `grafana/provisioning/dashboards/dashboards.yml`

File provider pointing to `/var/lib/grafana/dashboards`, 30s refresh, deletion disabled.

#### [NEW] `grafana/dashboards/`

| Dashboard | Source | Covers |
|-----------|--------|--------|
| Node.js Application | Grafana ID 11159 | Heap, GC, event loop, CPU |
| Redis | Grafana ID 763 | Memory, connected clients, commands, keyspace |
| PostgreSQL | Grafana ID 9628 | Connections, locks, cache hit ratio, tuple activity |
| Fastify HTTP & BullMQ | Custom build | Request rate, latency percentiles, error rate, queue gauges |
| Prisma Database | Custom build | Query duration P50/P95, active connections, pool saturation |

---

### 11. Package Dependencies

#### [MODIFY] `package.json`

Add to `dependencies`:

```json
"prom-client": "^15.x",
"fastify-metrics": "^13.x"
```

---

## Resolved Questions

| Question | Resolution |
|----------|-----------|
| `host.docker.internal` for Prometheus? | Not needed. All services inside Docker. Prometheus reaches backend at `fastify-backend:9091` / `fastify-worker:9092` via `monitoring` network. |
| `fastify-metrics` + Fastify 5? | Try plugin first. Fall back to manual `onResponse` hook with `prom-client` Histogram if breaking changes found. Note: Route matching URLs (like `/church/:id`) are used by default, protecting against metric cardinality issues. |
| SMTP for Alertmanager? | Reuse existing SMTP credentials from `.env`. Route critical alerts to `ADMIN_EMAIL`. |
| Where do monitoring services live? | Separate `docker-compose.monitoring.yml` overlay file. |
| Worker process instrumentation? | Yes — separate metrics server on `:9092` with its own Prometheus scrape job. |
| Memory monitor plugin? | Deprecated in favor of `prom-client` defaults + Prometheus alert. |
| Metrics in tests? | `METRICS_ENABLED=false` in `.env.test`. No metrics server started, no port conflicts. |
| Prisma Metrics GA? | In Prisma 5.x+, metrics are GA and available by default on the client instance, meaning no generator feature flag is required in `schema.prisma`. |
| pg_stat_statements note? | Community PostgreSQL dashboard panels (query statistics) require `shared_preload_libraries = 'pg_stat_statements'` and `CREATE EXTENSION pg_stat_statements;` enabled on the DB. |
| Alertmanager Route grouping? | Added explicit `group_by: ['alertname', 'environment']` in `alertmanager.yml` to prevent alert storms and enable email batching. |
| BullMQ queue stalled alert limit? | Set to 500 jobs / 10m. Adjust this threshold based on actual email campaign peaks and baseline measurements. |
| Silence Expiration Policy? | Silences must be configured with a short, explicit expiration time (TTL) in Alertmanager UI to avoid suppressing alerts forever. |
| Timezone consistency? | All containers run in UTC. Time synchronization is verified on host KVM. |

---

## Verification Plan

### Automated Tests

```bash
npm run test:unit:use-cases
npm run test:e2e
npm run test:unit:resilient-cache
npm run test:unit:rate-limiter
```

### Manual Verification

```bash
# 1. Start core + monitoring
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# 2. Confirm metrics endpoints (from inside Docker)
docker exec -it <fastify-api> curl http://localhost:9091/metrics
docker exec -it <fastify-worker> curl http://localhost:9092/metrics

# 3. Check Prometheus scrape targets (Requires SSH Tunnel 'ssh -L 9090:localhost:9090' or temporary port publish)
# http://localhost:9090/targets

# 4. Check alert rules are loaded (Requires SSH Tunnel)
# http://localhost:9090/alerts

# 5. Check Alertmanager (Requires SSH Tunnel 'ssh -L 9093:localhost:9093' or temporary port publish)
# http://localhost:9093

# 6. Open Grafana (Public via port 3001)
# http://localhost:3001 (admin / $GRAFANA_ADMIN_PASSWORD)
# Confirm: Prometheus datasource connected
# Confirm: All dashboards show populated data

# 7. Inspect /metrics raw response to verify there are no duplicate metric names (colliding prom-client with Prisma metrics)
# curl http://localhost:9091/metrics | sort | uniq -d
```

### Alert Smoke Test

```bash
# Stop the backend and wait for BackendApiDown to fire (2 min)
docker compose stop fastify-backend
# http://localhost:9090/alerts — BackendApiDown should be FIRING (Requires SSH Tunnel to view)
# http://localhost:9093 — alert in Alertmanager (Requires SSH Tunnel to view)
# Email received at ADMIN_EMAIL
docker compose start fastify-backend
```

---

## Architecture Overview

```
 Browser / Next.js / Admin
       │
       ▼ (Public Port 3001)
 ┌──────────────────────┐
 │  Grafana             │
 │  ├─ Prometheus DS    │
 │  ├─ Node.js dash     │
 │  ├─ HTTP + BullMQ    │
 │  ├─ Prisma DB        │
 │  ├─ Redis dash       │
 │  └─ PostgreSQL dash  │
 └──────────┬───────────┘
            │ (Internal Query)
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                     Prometheus (Internal)                   │
 │  Scrapes: api:9091, worker:9092, redis:9121, pg:9187,      │
 │           node-exp:9100, self, alertmanager                 │
 │  Evaluates: alerts.yml (Watchdog, availability, latency...) │
 └──────────┬──────────────────────────────────────────────────┘
            │
            ▼ (Internal Network)
 ┌─────────────────────────────────────────────────────────────┐
 │                     Alertmanager (Internal)                 │
 │  Routes:                                                    │
 │  ├─ critical → Immediate (Email + Webhook)                  │
 │  ├─ warning  → Batched (Email)                              │
 │  └─ watchdog → Continuous Heartbeat Webhook                 │
 └──────────┬───────────────────────┬──────────────────────────┘
            │                       │
            ▼                       ▼
 ┌──────────────────────┐        ┌──────────────────────┐
 │  Email (SMTP)        │        │  Webhook Fallback    │
 │  → ADMIN_EMAIL       │        │  → Discord/Telegram  │
 └──────────────────────┘        └──────────┬───────────┘
                                            │
                                            ▼ (Watchdog Heartbeat)
                                 ┌──────────────────────┐
                                 │ External Watchdog    │
                                 │ (Healthchecks.io)    │
                                 └──────────────────────┘
```
