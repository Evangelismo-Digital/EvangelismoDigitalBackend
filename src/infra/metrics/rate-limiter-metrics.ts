import { Counter, Gauge } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsRateLimiterConsumed = registry
  ? new Counter({
      name: 'rate_limiter_consumed_total',
      help: 'Successful consume (point granted)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const collectMetricsRateLimiterRejected = registry
  ? new Counter({
      name: 'rate_limiter_rejected_total',
      help: 'Rate limit exceeded (no points remaining)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const collectMetricsRateLimiterInfraDegraded = registry
  ? new Counter({
      name: 'rate_limiter_infra_degraded_total',
      help: 'Fail-open events (Redis down, traffic allowed)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const collectMetricsRateLimiterInfraRecovered = registry
  ? new Counter({
      name: 'rate_limiter_infra_recovered_total',
      help: 'Recovery from degraded state',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

/**
 * HTTP ingress limiting runs with `skipOnError: true`: Redis is the only source
 * of truth, and when it cannot answer the limit is skipped rather than turned
 * into a 500. These three make that skipping visible.
 *
 * `redis_up` is the gauge to alert on — it says whether the limit is being
 * enforced *right now*, and is authoritative even when no traffic is arriving.
 * The counters give the frequency and duration of episodes. All are published by
 * the health probe (`rate-limit-health-probe.ts`), not by the request path.
 */
export const collectMetricsHttpRateLimitRedisUp = registry
  ? new Gauge({
      name: 'http_rate_limit_redis_up',
      help: '1 when Redis can serve ingress rate limiting, 0 while the limit is being skipped',
      labelNames: ['subsystem'],
      registers: [registry],
    })
  : null

export const collectMetricsHttpRateLimitDegraded = registry
  ? new Counter({
      name: 'http_rate_limit_infra_degraded_total',
      help: 'Health-probe observations of a Redis that cannot serve ingress rate limiting',
      labelNames: ['subsystem'],
      registers: [registry],
    })
  : null

export const collectMetricsHttpRateLimitRecovered = registry
  ? new Counter({
      name: 'http_rate_limit_infra_recovered_total',
      help: 'Transitions of ingress rate limiting back to enforced',
      labelNames: ['subsystem'],
      registers: [registry],
    })
  : null
