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
