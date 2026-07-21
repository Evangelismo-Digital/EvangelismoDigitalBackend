import { Counter } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const rateLimiterConsumed = registry
  ? new Counter({
      name: 'rate_limiter_consumed_total',
      help: 'Successful consume (point granted)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const rateLimiterRejected = registry
  ? new Counter({
      name: 'rate_limiter_rejected_total',
      help: 'Rate limit exceeded (no points remaining)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const rateLimiterInfraDegraded = registry
  ? new Counter({
      name: 'rate_limiter_infra_degraded_total',
      help: 'Fail-open events (Redis down, traffic allowed)',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null

export const rateLimiterInfraRecovered = registry
  ? new Counter({
      name: 'rate_limiter_infra_recovered_total',
      help: 'Recovery from degraded state',
      labelNames: ['provider'],
      registers: [registry],
    })
  : null
