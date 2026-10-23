import { Counter, Gauge, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsCacheHits = registry
  ? new Counter({
      name: 'cache_hits_total',
      help: 'Cache envelope found in Redis (hit)',
      labelNames: ['prefix'],
      registers: [registry],
    })
  : null

export const collectMetricsCacheMisses = registry
  ? new Counter({
      name: 'cache_misses_total',
      help: 'Cache miss, fetcher invoked',
      labelNames: ['prefix'],
      registers: [registry],
    })
  : null

export const collectMetricsCacheErrors = registry
  ? new Counter({
      name: 'cache_errors_total',
      help: 'Redis read/write errors, corrupted envelopes',
      labelNames: ['prefix', 'error_type'],
      registers: [registry],
    })
  : null

export const collectMetricsCachePendingFetches = registry
  ? new Gauge({
      name: 'cache_pending_fetches',
      help: 'Current pendingFetches.size (circuit-breaker gauge)',
      labelNames: ['prefix'],
      registers: [registry],
    })
  : null

export const collectMetricsCacheFetchDuration = registry
  ? new Histogram({
      name: 'cache_fetch_duration_seconds',
      help: 'Duration of the fetcher call',
      labelNames: ['prefix'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [registry],
    })
  : null

export const collectMetricsCacheCircuitBreakerTrips = registry
  ? new Counter({
      name: 'cache_circuit_breaker_trips_total',
      help: 'Times pendingFetches >= MAX_PENDING',
      labelNames: ['prefix'],
      registers: [registry],
    })
  : null
