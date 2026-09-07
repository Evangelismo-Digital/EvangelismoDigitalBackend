import { Counter } from 'prom-client'
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
 * HTTP ingress limiting, which degrades rather than failing (see
 * `resilient-rate-limit-store.ts`). `degraded` counts every request served from
 * the in-process fallback — i.e. every request the cluster-wide limit did not
 * see — and `recovered` fires once per outage episode, so the two together give
 * both the blast radius and the episode count.
 */
export const collectMetricsHttpRateLimitDegraded = registry
  ? new Counter({
      name: 'http_rate_limit_infra_degraded_total',
      help: 'HTTP requests counted by the in-process fallback because Redis was unavailable',
      labelNames: ['route'],
      registers: [registry],
    })
  : null

export const collectMetricsHttpRateLimitRecovered = registry
  ? new Counter({
      name: 'http_rate_limit_infra_recovered_total',
      help: 'Transitions of the HTTP rate limiter back to Redis-backed counting',
      labelNames: ['route'],
      registers: [registry],
    })
  : null
