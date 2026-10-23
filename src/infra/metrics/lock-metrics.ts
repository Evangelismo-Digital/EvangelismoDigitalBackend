import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsLockAcquired = registry
  ? new Counter({
      name: 'distributed_lock_acquired_total',
      help: 'Successful lock acquisitions',
      labelNames: ['key'],
      registers: [registry],
    })
  : null

export const collectMetricsLockContention = registry
  ? new Counter({
      name: 'distributed_lock_contention_total',
      help: 'Failed acquisitions (lock held by another)',
      labelNames: ['key'],
      registers: [registry],
    })
  : null

export const collectMetricsLockReleased = registry
  ? new Counter({
      name: 'distributed_lock_released_total',
      help: 'Successful releases',
      labelNames: ['key'],
      registers: [registry],
    })
  : null

export const collectMetricsLockExpired = registry
  ? new Counter({
      name: 'distributed_lock_expired_total',
      help: 'Release/renew found lock expired or owned by another instance',
      labelNames: ['key'],
      registers: [registry],
    })
  : null

export const collectMetricsLockErrors = registry
  ? new Counter({
      name: 'distributed_lock_errors_total',
      help: 'Redis/infrastructure failures during lock operations',
      labelNames: ['operation'],
      registers: [registry],
    })
  : null

export const collectMetricsLockDuration = registry
  ? new Histogram({
      name: 'distributed_lock_duration_seconds',
      help: 'Time between acquire and release',
      labelNames: ['key'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
      registers: [registry],
    })
  : null
