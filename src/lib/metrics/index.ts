import { Registry, collectDefaultMetrics } from 'prom-client'
import { env } from '@env/index'

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

export { Counter, Gauge, Histogram, Summary } from 'prom-client'
