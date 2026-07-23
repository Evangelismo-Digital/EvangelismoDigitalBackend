# Monitoring Implementation Steps

Step-by-step implementation guide for the Prometheus, Grafana & Alertmanager monitoring stack. Each step is designed to be tackled independently by a coding agent, with clear dependencies and verification criteria.

**Source**: All requirements derived from [prometheus_grafana.md](prometheus_grafana.md)

---

## Overview

| Phase | Steps | Description |
|-------|-------|-------------|
| Foundation | 1-3 | Environment config, registry, metrics server |
| Integration | 4-7 | Connect metrics server to API/worker, HTTP metrics, deprecate old monitoring |
| Instrumentation | 8-14 | Add metrics to infrastructure components |
| Infrastructure | 15-19 | Docker services, Prometheus, Alertmanager, Grafana |
| Validation | 20 | End-to-end verification |

---

## Step 1: Environment Configuration

**Objective**: Add metrics-related environment variables to the application configuration.

### Files to Modify

- `src/env/index.ts`
- `.env.example`
- `.env.test`

### Implementation Details

**1. Update Zod schema in `src/env/index.ts`:**

Add after the existing Redis configuration block:

```typescript
// Metrics
METRICS_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
METRICS_API_PORT: z.coerce.number().default(9091),
METRICS_WORKER_PORT: z.coerce.number().default(9092),

// Grafana (used in docker-compose.monitoring.yml)
GRAFANA_ADMIN_PASSWORD: z.string().min(8),
```

**2. Add to `.env.example`:**

```env
# Metrics
METRICS_ENABLED=true
METRICS_API_PORT=9091
METRICS_WORKER_PORT=9092
GRAFANA_ADMIN_PASSWORD=changeme_in_production
```

**3. Add to `.env.test`:**

```env
METRICS_ENABLED=false
```

### Dependencies

None (first step)

### Verification

```bash
npm run test  # Ensure env parsing doesn't break
```

---

## Step 2: Metrics Registry & Default Metrics

**Objective**: Create the central metrics registry module that initializes prom-client and collects default Node.js metrics.

### Files to Create

- `src/lib/metrics/index.ts`

### Implementation Details

Create the `src/lib/metrics/` directory and `index.ts`:

```typescript
import { Registry, collectDefaultMetrics, Counter } from 'prom-client'
import { env } from '@/env'

let registry: Registry | null = null
let initialized = false

export function getRegistry(): Registry | null {
  if (!env.METRICS_ENABLED) return null
  
  if (!initialized) {
    registry = new Registry()
    collectDefaultMetrics({ register: registry })
    initialized = true
  }
  
  return registry
}

export function isMetricsEnabled(): boolean {
  return env.METRICS_ENABLED
}

// Re-export prom-client types for convenience
export { Counter, Gauge, Histogram, Summary } from 'prom-client'
```

**Key behaviors:**

1. Only initializes when `METRICS_ENABLED=true`
2. Calls `collectDefaultMetrics()` for Node.js process metrics (heap, GC, event loop lag, CPU)
3. Exports the default `Registry` singleton
4. Lazy initialization on first access
5. Re-exports prom-client types for metric modules

### Dependencies

- Step 1 (needs `METRICS_ENABLED` env var)

### Verification

```typescript
// Unit test
describe('metrics registry', () => {
  it('returns null when METRICS_ENABLED=false', () => {
    process.env.METRICS_ENABLED = 'false'
    expect(getRegistry()).toBeNull()
  })
  
  it('returns registry when METRICS_ENABLED=true', () => {
    process.env.METRICS_ENABLED = 'true'
    expect(getRegistry()).toBeInstanceOf(Registry)
  })
})
```

---

## Step 3: Metrics Server

**Objective**: Create a dedicated Fastify instance that serves the `/metrics` endpoint with timeout protection.

### Files to Create

- `src/metrics-server.ts`

### Implementation Details

```typescript
import Fastify, { FastifyInstance } from 'fastify'
import { getRegistry, Counter } from '@/lib/metrics'
import { env } from '@/env'
import { logger } from '@/lib/logger'

let metricsServer: FastifyInstance | null = null

const metricsCollectionErrors = new Counter({
  name: 'metrics_collection_errors_total',
  help: 'Errors during metrics collection',
  labelNames: ['source'],
})

interface StartOptions {
  port: number
  includePrisma: boolean
  prismaClient?: PrismaClient | null
}

export async function startMetricsServer(options: StartOptions): Promise<void> {
  if (!env.METRICS_ENABLED) {
    logger.info('Metrics server disabled')
    return
  }

  metricsServer = Fastify({ logger: false })

  metricsServer.get('/metrics', async (request, reply) => {
    const registry = getRegistry()
    if (!registry) {
      return reply.status(503).send('Metrics disabled')
    }

    const timeout = (promise: Promise<string>, ms: number, source: string): Promise<string> =>
      Promise.race([
        promise,
        new Promise<string>((_, reject) =>
          setTimeout(() => {
            metricsCollectionErrors.inc({ source })
            reject(new Error(`${source} timeout`))
          }, ms)
        ),
      ])

    const collectors: Promise<string>[] = [
      timeout(registry.metrics(), 2000, 'prom-client'),
    ]

    if (options.includePrisma && options.prismaClient) {
      collectors.push(
        timeout(options.prismaClient.$metrics.prometheus(), 2000, 'prisma')
      )
    }

    // Trigger lazy BullMQ collection before metrics()
    try {
      await timeout(collectBullMQMetrics(), 2000, 'bullmq')
    } catch (err) {
      logger.warn({ err }, 'BullMQ metrics collection failed')
    }

    const results = await Promise.allSettled(collectors)
    const output = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value)
      .join('\n\n')

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    return output
  })

  metricsServer.get('/health', async () => ({ status: 'ok' }))

  await metricsServer.listen({ host: '0.0.0.0', port: options.port })
  logger.info({ port: options.port }, 'Metrics server started')
}

export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    await metricsServer.close()
    metricsServer = null
    logger.info('Metrics server stopped')
  }
}
```

**Key behaviors:**

1. Binds to `0.0.0.0` on configurable port
2. 2-second timeout protection for async collectors (BullMQ, Prisma, prom-client)
3. Uses `Promise.allSettled` for graceful degradation
4. Increments `metrics_collection_errors_total` on failures
5. `/health` endpoint for Docker healthchecks
6. Guards startup behind `METRICS_ENABLED`

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Start server
npm run dev

# Test endpoints
curl http://localhost:9091/metrics
curl http://localhost:9091/health
```

---

## Step 4: Integrate Metrics Server into API

**Objective**: Start the metrics server alongside the main API server with proper shutdown ordering.

### Files to Modify

- `src/server.ts`

### Implementation Details

**1. Add imports:**

```typescript
import { startMetricsServer, stopMetricsServer } from './metrics-server'
```

**2. After main app starts, start metrics server:**

```typescript
// Existing: await app.listen({ host: '0.0.0.0', port: env.APP_PORT })

// Add after:
await startMetricsServer({
  port: env.METRICS_API_PORT,
  includePrisma: true,
  prismaClient: prisma, // Import from your Prisma client module
})
```

**3. Update `closeWithGrace` shutdown sequence:**

Metrics server must close **last** to maintain telemetry during shutdown:

```typescript
closeWithGrace(async ({ err }) => {
  if (err) logger.error(err)
  
  // Close main API first
  await app.close()
  
  // Close DB/Redis connections
  await prisma.$disconnect()
  await redis.quit()
  
  // Close metrics server LAST
  await stopMetricsServer()
})
```

### Dependencies

- Step 3 (needs metrics server)

### Verification

```bash
# Start API
npm run dev

# Verify both ports respond
curl http://localhost:3000/health
curl http://localhost:9091/metrics
```

---

## Step 5: Integrate Metrics Server into Worker

**Objective**: Start the metrics server alongside the background worker with proper shutdown ordering.

### Files to Modify

- `src/worker.ts`

### Implementation Details

**1. Add imports:**

```typescript
import { startMetricsServer, stopMetricsServer } from './metrics-server'
```

**2. After worker bootstrap, start metrics server:**

```typescript
// After existing bootstrap (mail worker, outbox processor, etc.)

await startMetricsServer({
  port: env.METRICS_WORKER_PORT,
  includePrisma: false,  // Worker doesn't use Prisma directly
  prismaClient: null,
})
```

**3. Update cleanup sequence:**

```typescript
async function cleanup() {
  // Existing cleanup: pause queues, close workers, disconnect Redis
  
  // Close metrics server LAST
  await stopMetricsServer()
}
```

### Dependencies

- Step 3 (needs metrics server)

### Verification

```bash
# Start worker
npm run worker

# Verify metrics endpoint
curl http://localhost:9092/metrics
```

---

## Step 6: Fastify HTTP Metrics Plugin

**Objective**: Register fastify-metrics plugin to automatically collect HTTP request metrics.

### Files to Modify

- `src/app.ts`

### Implementation Details

**1. Add import:**

```typescript
import metricsPlugin from 'fastify-metrics'
import { getRegistry } from '@/lib/metrics'
```

**2. Register plugin after `asyncContext`, before routes:**

```typescript
// After: app.register(asyncContext)

const registry = getRegistry()
if (registry) {
  app.register(metricsPlugin, {
    endpoint: null,        // Do NOT expose /metrics on :3000
    defaultMetrics: { enabled: false }, // Handled in metrics/index.ts
    routeMetrics: { enabled: true },
    register: registry,
  })
}

// Before: app.register(appRoutes)
```

**Fallback** (if Fastify 5 compatibility issues arise):

Replace with manual `onResponse` hook:

```typescript
import { Histogram } from 'prom-client'

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
})

app.addHook('onResponse', (request, reply, done) => {
  const route = request.routeOptions?.url || 'unknown'
  httpRequestDuration.observe(
    { method: request.method, route, status_code: reply.statusCode },
    reply.elapsedTime / 1000
  )
  done()
})
```

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Make HTTP requests
curl http://localhost:3000/api/churches

# Check metrics include HTTP data
curl http://localhost:9091/metrics | grep http_request
```

---

## Step 7: Deprecate Memory Monitor Plugin

**Objective**: Remove the legacy `setInterval`-based heap monitoring, now replaced by prom-client defaults and Prometheus alerts.

### Files to Modify

- `src/app.ts`

### Files to Delete

- `src/http/plugins/memory-monitor.plugin.ts`

### Implementation Details

**1. Remove from `src/app.ts`:**

```typescript
// DELETE this import:
import { memoryMonitor } from './http/plugins/memory-monitor.plugin'

// DELETE this registration:
app.register(memoryMonitor)
```

**2. Delete the file:**

```bash
rm src/http/plugins/memory-monitor.plugin.ts
```

### Replaced By

- `prom-client` `collectDefaultMetrics()` exposes:
  - `process_heap_used_bytes`
  - `process_resident_memory_bytes`
- Prometheus alert `HighHeapMemoryUsage` (Step 16) fires at 85% heap usage
- Grafana Node.js dashboard (Step 18) visualizes memory trends

### Dependencies

- Step 2 (default metrics must be active first)

### Verification

```bash
# Verify default metrics exist
curl http://localhost:9091/metrics | grep process_heap_used_bytes
```

---

## Step 8: Cache Metrics

**Objective**: Instrument the resilient cache with metrics for hits, misses, errors, and circuit breaker state.

### Files to Create

- `src/lib/metrics/cache-metrics.ts`

### Files to Modify

- `src/lib/infra/cache/resilient-cache.ts`

### Metrics Definition

```typescript
// src/lib/metrics/cache-metrics.ts
import { Counter, Gauge, Histogram } from 'prom-client'
import { getRegistry, isMetricsEnabled } from './index'

const registry = getRegistry()

export const cacheHits = registry ? new Counter({
  name: 'cache_hits_total',
  help: 'Cache envelope found in Redis (hit)',
  labelNames: ['prefix'],
  registers: [registry],
}) : null

export const cacheMisses = registry ? new Counter({
  name: 'cache_misses_total',
  help: 'Cache miss, fetcher invoked',
  labelNames: ['prefix'],
  registers: [registry],
}) : null

export const cacheErrors = registry ? new Counter({
  name: 'cache_errors_total',
  help: 'Redis read/write errors, corrupted envelopes',
  labelNames: ['prefix', 'error_type'],
  registers: [registry],
}) : null

export const cachePendingFetches = registry ? new Gauge({
  name: 'cache_pending_fetches',
  help: 'Current pendingFetches.size (circuit-breaker gauge)',
  labelNames: ['prefix'],
  registers: [registry],
}) : null

export const cacheFetchDuration = registry ? new Histogram({
  name: 'cache_fetch_duration_seconds',
  help: 'Duration of the fetcher call',
  labelNames: ['prefix'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
}) : null

export const cacheCircuitBreakerTrips = registry ? new Counter({
  name: 'cache_circuit_breaker_trips_total',
  help: 'Times pendingFetches >= MAX_PENDING',
  labelNames: ['prefix'],
  registers: [registry],
}) : null
```

### Instrumentation Points in `resilient-cache.ts`

| Location | Event | Metric Call |
|----------|-------|-------------|
| After finding cached envelope | Cache hit | `cacheHits?.inc({ prefix })` |
| When fetcher is invoked | Cache miss | `cacheMisses?.inc({ prefix })` |
| On Redis read error | Read error | `cacheErrors?.inc({ prefix, error_type: 'read' })` |
| On Redis write error | Write error | `cacheErrors?.inc({ prefix, error_type: 'write' })` |
| On corrupted envelope | Parse error | `cacheErrors?.inc({ prefix, error_type: 'corrupted' })` |
| After adding to `pendingFetches` | Gauge update | `cachePendingFetches?.set({ prefix }, pendingFetches.size)` |
| After removing from `pendingFetches` | Gauge update | `cachePendingFetches?.set({ prefix }, pendingFetches.size)` |
| When `pendingFetches >= MAX_PENDING` | Circuit trip | `cacheCircuitBreakerTrips?.inc({ prefix })` |
| Around fetcher call | Duration | `const end = cacheFetchDuration?.startTimer({ prefix }); ... end?.()` |

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Trigger cache operations via API
curl http://localhost:3000/api/address/12345678

# Check metrics
curl http://localhost:9091/metrics | grep cache_
```

---

## Step 9: Distributed Lock Metrics

**Objective**: Instrument the distributed lock with metrics for acquisitions, contentions, releases, and durations.

### Files to Create

- `src/lib/metrics/lock-metrics.ts`

### Files to Modify

- `src/lib/infra/distributed-lock/distributed-lock.ts`

### Metrics Definition

```typescript
// src/lib/metrics/lock-metrics.ts
import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const lockAcquired = registry ? new Counter({
  name: 'distributed_lock_acquired_total',
  help: 'Successful lock acquisitions',
  labelNames: ['key'],
  registers: [registry],
}) : null

export const lockContention = registry ? new Counter({
  name: 'distributed_lock_contention_total',
  help: 'Failed acquisitions (lock held by another)',
  labelNames: ['key'],
  registers: [registry],
}) : null

export const lockReleased = registry ? new Counter({
  name: 'distributed_lock_released_total',
  help: 'Successful releases',
  labelNames: ['key'],
  registers: [registry],
}) : null

export const lockExpired = registry ? new Counter({
  name: 'distributed_lock_expired_total',
  help: 'Release/renew found lock expired',
  labelNames: ['key'],
  registers: [registry],
}) : null

export const lockDuration = registry ? new Histogram({
  name: 'distributed_lock_duration_seconds',
  help: 'Time between acquire and release',
  labelNames: ['key'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [registry],
}) : null
```

### Instrumentation Points in `distributed-lock.ts`

| Location | Event | Metric Call |
|----------|-------|-------------|
| `acquire` returns token | Success | `lockAcquired?.inc({ key })` |
| `acquire` returns null | Contention | `lockContention?.inc({ key })` |
| `release` succeeds | Released | `lockReleased?.inc({ key })` |
| `release` finds expired | Expired | `lockExpired?.inc({ key })` |
| `renew` finds expired | Expired | `lockExpired?.inc({ key })` |
| Between acquire and release | Duration | Store timestamp at acquire, observe at release |

**Note**: Lock keys are static constants (e.g., `lock:outbox-processor`), safe for labels.

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Trigger lock operations (outbox processing)
# Check metrics
curl http://localhost:9091/metrics | grep distributed_lock
```

---

## Step 10: Rate Limiter Metrics

**Objective**: Instrument the Redis rate limiter with metrics for consumption, rejection, and infrastructure health.

### Files to Create

- `src/lib/metrics/rate-limiter-metrics.ts`

### Files to Modify

- `src/lib/infra/rate-limiter/redis-rate-limiter.ts`

### Metrics Definition

```typescript
// src/lib/metrics/rate-limiter-metrics.ts
import { Counter } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const rateLimiterConsumed = registry ? new Counter({
  name: 'rate_limiter_consumed_total',
  help: 'Successful consume (point granted)',
  labelNames: ['provider'],
  registers: [registry],
}) : null

export const rateLimiterRejected = registry ? new Counter({
  name: 'rate_limiter_rejected_total',
  help: 'Rate limit exceeded (no points remaining)',
  labelNames: ['provider'],
  registers: [registry],
}) : null

export const rateLimiterInfraDegraded = registry ? new Counter({
  name: 'rate_limiter_infra_degraded_total',
  help: 'Fail-open events (Redis down, traffic allowed)',
  labelNames: ['provider'],
  registers: [registry],
}) : null

export const rateLimiterInfraRecovered = registry ? new Counter({
  name: 'rate_limiter_infra_recovered_total',
  help: 'Recovery from degraded state',
  labelNames: ['provider'],
  registers: [registry],
}) : null
```

### Instrumentation Points in `redis-rate-limiter.ts`

| Location | Event | Metric Call |
|----------|-------|-------------|
| `tryConsume` succeeds | Consumed | `rateLimiterConsumed?.inc({ provider })` |
| Rate limit exceeded | Rejected | `rateLimiterRejected?.inc({ provider })` |
| `logInfraDegraded` called | Degraded | `rateLimiterInfraDegraded?.inc({ provider })` |
| `logInfraRecoveryIfNeeded` called | Recovered | `rateLimiterInfraRecovered?.inc({ provider })` |

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Make requests to trigger rate limiting
for i in {1..100}; do curl http://localhost:3000/api/address/12345678; done

# Check metrics
curl http://localhost:9091/metrics | grep rate_limiter
```

---

## Step 11: Outbox Metrics

**Objective**: Instrument the outbox pipeline (processor, cron, signal) with metrics for event flow and failures.

### Files to Create

- `src/lib/metrics/outbox-metrics.ts`

### Files to Modify

- `src/lib/infra/jobs/outbox-processor.ts`
- `src/lib/infra/jobs/outbox-cron.ts`
- `src/lib/infra/events/outbox-signal.ts`

### Metrics Definition

```typescript
// src/lib/metrics/outbox-metrics.ts
import { Counter } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const outboxDispatched = registry ? new Counter({
  name: 'outbox_events_dispatched_total',
  help: 'Events successfully dispatched to BullMQ',
  registers: [registry],
}) : null

export const outboxReverted = registry ? new Counter({
  name: 'outbox_events_reverted_total',
  help: 'Events reverted to PENDING after dispatch failure',
  registers: [registry],
}) : null

export const outboxStuckRecovered = registry ? new Counter({
  name: 'outbox_events_stuck_recovered_total',
  help: 'Stuck SENDING events recovered by cron',
  registers: [registry],
}) : null

export const outboxCronRuns = registry ? new Counter({
  name: 'outbox_cron_runs_total',
  help: 'Cron executions by phase',
  labelNames: ['phase'],
  registers: [registry],
}) : null

export const outboxSignalPublished = registry ? new Counter({
  name: 'outbox_signal_published_total',
  help: 'Pub/Sub signals published',
  registers: [registry],
}) : null

export const outboxSignalPublishFailed = registry ? new Counter({
  name: 'outbox_signal_publish_failed_total',
  help: 'Pub/Sub publish failures (Redis down)',
  registers: [registry],
}) : null
```

### Instrumentation Points

**outbox-processor.ts:**

| Location | Event | Metric Call |
|----------|-------|-------------|
| After successful `dispatchToBullMQ` | Dispatched | `outboxDispatched?.inc()` |
| On revert to PENDING | Reverted | `outboxReverted?.inc()` |
| On stuck event recovery | Recovered | `outboxStuckRecovered?.inc()` |

**outbox-cron.ts:**

| Location | Event | Metric Call |
|----------|-------|-------------|
| Phase 1 start | Recovery cron | `outboxCronRuns?.inc({ phase: 'recovery' })` |
| Phase 2 start | Pending cron | `outboxCronRuns?.inc({ phase: 'pending' })` |

**outbox-signal.ts:**

| Location | Event | Metric Call |
|----------|-------|-------------|
| After successful publish | Published | `outboxSignalPublished?.inc()` |
| On publish failure | Failed | `outboxSignalPublishFailed?.inc()` |

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Check metrics (after outbox activity)
curl http://localhost:9092/metrics | grep outbox_
```

---

## Step 12: Provider Metrics

**Objective**: Instrument the resilient providers (address, geo, routing) with unified metrics for requests, fallbacks, and latency.

### Files to Create

- `src/lib/metrics/provider-metrics.ts`

### Files to Modify

- `src/providers/address-provider/resilient-address-provider.ts`
- `src/providers/geo-provider/resilient-geo-provider.ts`
- `src/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator.ts`

### Metrics Definition

```typescript
// src/lib/metrics/provider-metrics.ts
import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const providerRequest = registry ? new Counter({
  name: 'provider_request_total',
  help: 'Per-provider request outcomes',
  labelNames: ['provider', 'layer', 'result'],
  registers: [registry],
}) : null

export const providerFallback = registry ? new Counter({
  name: 'provider_fallback_total',
  help: 'Fallback transitions between providers',
  labelNames: ['layer', 'from_provider', 'to_provider'],
  registers: [registry],
}) : null

export const providerChainExhausted = registry ? new Counter({
  name: 'provider_chain_exhausted_total',
  help: 'All providers in a chain failed',
  labelNames: ['layer'],
  registers: [registry],
}) : null

export const providerLatency = registry ? new Histogram({
  name: 'provider_latency_seconds',
  help: 'Individual provider response time',
  labelNames: ['provider', 'layer'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
}) : null
```

### Label Values

- `layer`: `address` | `geocoding` | `routing`
- `result`: `success` | `not_found` | `retryable` | `fatal`

### Instrumentation Points

**resilient-address-provider.ts:**

| Location | Event | Metric Call |
|----------|-------|-------------|
| Provider success | Success | `providerRequest?.inc({ provider, layer: 'address', result: 'success' })` |
| Provider NOT_FOUND | Not found | `providerRequest?.inc({ provider, layer: 'address', result: 'not_found' })` |
| RETRYABLE error | Retryable | `providerRequest?.inc({ provider, layer: 'address', result: 'retryable' })` |
| Fatal error | Fatal | `providerRequest?.inc({ provider, layer: 'address', result: 'fatal' })` |
| Fallback to next | Fallback | `providerFallback?.inc({ layer: 'address', from_provider, to_provider })` |
| All providers failed | Exhausted | `providerChainExhausted?.inc({ layer: 'address' })` |
| Around provider call | Latency | `const end = providerLatency?.startTimer({ provider, layer: 'address' }); ... end?.()` |

**resilient-geo-provider.ts:**

Same pattern with `layer: 'geocoding'`

**resilient-church-routing-provider.decorator.ts:**

Same pattern with `layer: 'routing'`

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Make geo/address lookups
curl "http://localhost:3000/api/churches?cep=01310100"

# Check metrics
curl http://localhost:9091/metrics | grep provider_
```

---

## Step 13: BullMQ Metrics

**Objective**: Create lazy-collected gauges for BullMQ queue state, invoked on each Prometheus scrape.

### Files to Create

- `src/lib/metrics/bullmq-metrics.ts`

### Implementation Details

```typescript
// src/lib/metrics/bullmq-metrics.ts
import { Gauge } from 'prom-client'
import { getRegistry } from './index'
import { Queue } from 'bullmq'

const registry = getRegistry()

export const bullmqJobs = registry ? new Gauge({
  name: 'bullmq_jobs',
  help: 'Current job count by state',
  labelNames: ['queue', 'state'],
  registers: [registry],
}) : null

// Registry of queues to collect metrics from
const queues: Map<string, Queue> = new Map()

export function registerQueue(name: string, queue: Queue): void {
  queues.set(name, queue)
}

export function unregisterQueue(name: string): void {
  queues.delete(name)
}

// Called lazily on each Prometheus scrape
export async function collectBullMQMetrics(): Promise<void> {
  if (!bullmqJobs) return

  for (const [name, queue] of queues) {
    const counts = await queue.getJobCounts()
    
    for (const [state, count] of Object.entries(counts)) {
      bullmqJobs.set({ queue: name, state }, count)
    }
  }
}
```

**Key behaviors:**

1. Exports `registerQueue()` for worker to register its queues
2. Exports `collectBullMQMetrics()` for lazy collection
3. Called from `metrics-server.ts` before serving `/metrics`
4. Does not use timers to avoid unnecessary Redis load

### Integration with worker.ts

```typescript
import { registerQueue, unregisterQueue } from '@/lib/metrics/bullmq-metrics'

// After creating queues
registerQueue('mail', mailQueue)

// On cleanup
unregisterQueue('mail')
```

### Dependencies

- Step 3 (called from metrics server)

### Verification

```bash
# Check metrics include queue state
curl http://localhost:9092/metrics | grep bullmq_jobs
```

---

## Step 14: Email Metrics

**Objective**: Instrument the mail worker with metrics for email processing outcomes and batch duration.

### Files to Create

- `src/lib/metrics/email-metrics.ts`

### Files to Modify

- `src/lib/workers/mail-worker.ts`

### Metrics Definition

```typescript
// src/lib/metrics/email-metrics.ts
import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const emailsSent = registry ? new Counter({
  name: 'emails_sent_total',
  help: 'Emails successfully sent via SMTP',
  registers: [registry],
}) : null

export const emailsFailed = registry ? new Counter({
  name: 'emails_failed_total',
  help: 'Email send failures',
  labelNames: ['error_type'],
  registers: [registry],
}) : null

export const emailBatchDuration = registry ? new Histogram({
  name: 'email_batch_duration_seconds',
  help: 'Duration to process a mail job batch',
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
}) : null
```

### Instrumentation Points in `mail-worker.ts`

| Location | Event | Metric Call |
|----------|-------|-------------|
| Batch complete (all sent) | Sent | `emailsSent?.inc(count)` |
| SMTP failure | SMTP error | `emailsFailed?.inc({ error_type: 'smtp' })` |
| Infrastructure failure | Infra error | `emailsFailed?.inc({ error_type: 'infra' })` |
| Idempotency skip | Idempotency | `emailsFailed?.inc({ error_type: 'idempotency' })` |
| Around job processing | Duration | `const end = emailBatchDuration?.startTimer(); ... end?.()` |

### Dependencies

- Step 2 (needs registry)

### Verification

```bash
# Check metrics (after email job processing)
curl http://localhost:9092/metrics | grep email
```

---

## Step 15: Docker Compose Monitoring Stack

**Objective**: Create the Docker Compose overlay file with all monitoring services.

### Files to Create

- `docker-compose.monitoring.yml`

### Implementation Details

```yaml
# docker-compose.monitoring.yml
version: '3.8'

networks:
  monitoring:
    driver: bridge

services:
  prometheus:
    image: prom/prometheus:v3.7.3
    container_name: prometheus
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--storage.tsdb.retention.size=10GB'
      - '--web.enable-lifecycle'
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1G
        reservations:
          memory: 256M
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9090/-/ready"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    depends_on:
      - alertmanager
      - redis-exporter
      - postgres-exporter
      - node-exporter
    networks:
      - monitoring
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: alertmanager
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    deploy:
      resources:
        limits:
          cpus: '0.1'
          memory: 128M
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9093/-/ready"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    networks:
      - monitoring
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  grafana:
    image: grafana/grafana:13.1.0
    container_name: grafana
    ports:
      - "3001:3000"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana_data:/var/lib/grafana
    environment:
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    depends_on:
      - prometheus
    networks:
      - monitoring
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  redis-exporter:
    image: oliver006/redis_exporter:v1.73.0
    container_name: redis-exporter
    environment:
      - REDIS_ADDR=redis:6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    deploy:
      resources:
        limits:
          cpus: '0.1'
          memory: 64M
    restart: unless-stopped
    networks:
      - monitoring
      - evangelismo-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres-exporter:
    image: quay.io/prometheuscommunity/postgres-exporter:v0.16.0
    container_name: postgres-exporter
    environment:
      - DATA_SOURCE_NAME=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?sslmode=disable
    deploy:
      resources:
        limits:
          cpus: '0.1'
          memory: 64M
    restart: unless-stopped
    networks:
      - monitoring
      - evangelismo-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  node-exporter:
    image: prom/node-exporter:v1.9.1
    container_name: node-exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
    pid: host
    deploy:
      resources:
        limits:
          cpus: '0.1'
          memory: 64M
    restart: unless-stopped
    networks:
      - monitoring
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  prometheus_data:
  alertmanager_data:
  grafana_data:
```

### Dependencies

None (Docker configuration)

### Verification

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config
```

---

## Step 16: Prometheus Configuration

**Objective**: Create Prometheus scrape configuration and alert rules.

### Files to Create

- `prometheus/prometheus.yml`
- `prometheus/alerts.yml`

### prometheus.yml

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

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'alertmanager'
    static_configs:
      - targets: ['alertmanager:9093']
```

### alerts.yml

Full alert rules organized by domain:

- **Availability**: `BackendApiDown`, `BackendWorkerDown`, `Watchdog`
- **HTTP**: `HighHttpErrorRate`, `HighHttpLatencyP95`
- **Node.js**: `HighHeapMemoryUsage`, `HighEventLoopLag`
- **BullMQ**: `BullMQHighFailedJobs`, `BullMQQueueStalled`
- **Database**: `HighDbQueryDuration`, `HighDbConnectionPoolUsage`
- **Redis**: `RedisDown`, `RateLimiterFailOpen`, `DistributedLockContention`
- **Email/Outbox**: `SmtpDispatchFailure`, `OutboxDispatchRevertRate`
- **Providers**: `AddressProviderChainExhausted`, `GeoProviderChainExhausted`, `ProviderHighLatency`
- **Host**: `HostDiskSpaceRunningLow`, `HostCpuSaturation`, `HostMemoryRunningLow`

(See prometheus_grafana.md for full alert definitions)

### Dependencies

- Step 15 (Docker compose)
- Steps 8-14 (metrics exist)

### Verification

```bash
# Start stack
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Check targets (via SSH tunnel or temporary port publish)
# http://localhost:9090/targets

# Check alerts loaded
# http://localhost:9090/alerts
```

---

## Step 17: Alertmanager Configuration

**Objective**: Configure Alertmanager with routing, receivers, and inhibit rules.

### Files to Create

- `alertmanager/alertmanager.yml`

### Implementation Details

```yaml
global:
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_EMAIL}'
  smtp_auth_username: '${SMTP_EMAIL}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true

route:
  receiver: 'default'
  group_by: ['alertname', 'environment']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
      continue: true
    - match:
        severity: warning
      receiver: 'warning-alerts'
      group_interval: 5m

receivers:
  - name: 'default'
    email_configs:
      - to: '${ADMIN_EMAIL}'

  - name: 'critical-alerts'
    email_configs:
      - to: '${ADMIN_EMAIL}'
        send_resolved: true
    webhook_configs:
      - url: '${ALERTMANAGER_WEBHOOK_URL}'
        send_resolved: true

  - name: 'warning-alerts'
    email_configs:
      - to: '${ADMIN_EMAIL}'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname']
```

### Dependencies

- Step 15 (Docker compose)

### Verification

```bash
# Stop backend to trigger alert
docker compose stop fastify-backend

# Wait 2 min for BackendApiDown to fire
# Check Alertmanager UI (via SSH tunnel)
# Verify email received

docker compose start fastify-backend
```

---

## Step 18: Grafana Provisioning

**Objective**: Configure Grafana with auto-provisioned datasource and dashboards.

### Files to Create

- `grafana/provisioning/datasources/prometheus.yml`
- `grafana/provisioning/dashboards/dashboards.yml`
- `grafana/dashboards/node-js-application-11159.json`
- `grafana/dashboards/redis-763.json`
- `grafana/dashboards/postgresql-9628.json`
- `grafana/dashboards/fastify-http-bullmq.json` (custom)
- `grafana/dashboards/prisma-database.json` (custom)

### Datasource provisioning

```yaml
# grafana/provisioning/datasources/prometheus.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Dashboard provisioning

```yaml
# grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
```

### Dashboards

| Dashboard | Source | Description |
|-----------|--------|-------------|
| Node.js Application | Grafana ID 11159 | Heap, GC, event loop, CPU |
| Redis | Grafana ID 763 | Memory, clients, commands |
| PostgreSQL | Grafana ID 9628 | Connections, locks, cache hit |
| Fastify HTTP & BullMQ | Custom build | Request rate, latency, queue gauges |
| Database internals | Custom build | Connections, cache-hit, locks, long-running tx, top queries |

> [!NOTE]
> **Prisma Database board replaced:** Prisma runtime metrics are not wired (`startMetricsServer` takes
> only `{ port }`), so the doc's "Prisma Database" dashboard has no data source. It is replaced by a
> custom **Database internals** dashboard built from postgres-exporter metrics.

> [!NOTE]
> **`pg_stat_statements` — implemented in this step (was deferred from Step 16):**
> `shared_preload_libraries = 'pg_stat_statements'` is set via the `db` service `command:` in
> `docker-compose.yml` and `docker-compose.prod.yml`; the extension is declared in
> `prisma/schema.prisma` (`postgresqlExtensions`) and created by migration
> `20260723010000_add_pg_stat_statements`; and the exporter enables `--collector.stat_statements`
> (`--collector.stat_statements.include_query`). Enabling `shared_preload_libraries` requires a **db
> container recreate** (the data volume persists).

### Dependencies

- Step 15 (Docker compose)
- Step 16 (Prometheus)

### Verification

```bash
# Open Grafana
# http://localhost:3001 (admin / $GRAFANA_ADMIN_PASSWORD)

# Verify:
# - Prometheus datasource connected
# - All dashboards show populated data
```

---

## Step 19: Update Core Docker Compose

**Objective**: Add log rotation and healthchecks to existing services.

### Files to Modify

- `docker-compose.yml`

### Changes

1. Add log rotation to `db` and `redis` services:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

2. Ensure network is properly defined for external access:

```yaml
networks:
  evangelismo-network:
    driver: bridge
    name: evangelismo-network
```

3. Add healthchecks if missing

### Dependencies

None

### Verification

```bash
docker compose config
```

---

## Step 20: End-to-End Verification

**Objective**: Validate the complete monitoring stack is working correctly.

### Automated Tests

```bash
npm run test:unit:use-cases
npm run test:e2e
npm run test:unit:resilient-cache
npm run test:unit:rate-limiter
```

### Manual Verification Checklist

1. **Start full stack:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
   ```

2. **Verify metrics endpoints:**
   ```bash
   docker exec -it fastify-api curl http://localhost:9091/metrics
   docker exec -it fastify-worker curl http://localhost:9092/metrics
   ```

3. **Check Prometheus targets (requires SSH tunnel):**
   ```bash
   ssh -L 9090:localhost:9090 user@host
   # http://localhost:9090/targets - all should be UP
   ```

4. **Check alert rules loaded:**
   ```bash
   # http://localhost:9090/alerts
   ```

5. **Check Alertmanager (requires SSH tunnel):**
   ```bash
   ssh -L 9093:localhost:9093 user@host
   # http://localhost:9093
   ```

6. **Open Grafana (public):**
   ```bash
   # http://localhost:3001 (admin / $GRAFANA_ADMIN_PASSWORD)
   # Confirm: Prometheus datasource connected
   # Confirm: All dashboards show populated data
   ```

7. **Verify no duplicate metrics:**
   ```bash
   curl http://localhost:9091/metrics | sort | uniq -d
   ```

### Alert Smoke Test

```bash
# Stop the backend
docker compose stop fastify-backend

# Wait 2 minutes for BackendApiDown to fire
# Check Prometheus alerts page - should show FIRING
# Check Alertmanager - alert should appear
# Check email - should receive notification

# Restart backend
docker compose start fastify-backend

# Verify alert resolves
```

### Dependencies

All previous steps (1-19)

### Success Criteria

- All Prometheus scrape targets are UP
- All alert rules are loaded without errors
- Grafana dashboards display data
- Alert smoke test fires and resolves correctly
- No duplicate metric names in output
- All automated tests pass

---

## High Cardinality Protection

When adding any new metrics, follow these rules to prevent memory exhaustion:

1. **Never** use dynamic IDs, tokens, UUIDs, IPs, or user-specific inputs as label values
2. **Always** sanitize dynamic keys to high-level categories
3. Current safe patterns: `lock:outbox-processor`, `cache:cep-coords:`, etc.
4. Any future dynamic instrumentation must comply

---

## Summary

| Step | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Environment Configuration | Low |
| 2 | Metrics Registry | Low |
| 3 | Metrics Server | Medium |
| 4 | API Integration | Low |
| 5 | Worker Integration | Low |
| 6 | HTTP Metrics Plugin | Low |
| 7 | Deprecate Memory Monitor | Low |
| 8 | Cache Metrics | Medium |
| 9 | Lock Metrics | Medium |
| 10 | Rate Limiter Metrics | Medium |
| 11 | Outbox Metrics | Medium |
| 12 | Provider Metrics | Medium |
| 13 | BullMQ Metrics | Low |
| 14 | Email Metrics | Low |
| 15 | Docker Compose | Medium |
| 16 | Prometheus Config | Medium |
| 17 | Alertmanager Config | Low |
| 18 | Grafana Provisioning | Medium |
| 19 | Core Docker Compose | Low |
| 20 | E2E Verification | Low |

Total: 20 steps, building incrementally from foundation to full observability.
