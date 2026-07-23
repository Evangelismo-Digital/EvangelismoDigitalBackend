import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'
import { Result, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'

const registry = getRegistry()

/** Bounded set of resilient-provider layers used as the `layer` label. */
export type ProviderMetricLayer = 'address' | 'geocoding' | 'routing'

export const collectMetricsProviderRequest = registry
  ? new Counter({
      name: 'provider_request_total',
      help: 'Per-provider request outcomes',
      labelNames: ['provider', 'layer', 'result'],
      registers: [registry],
    })
  : null

export const collectMetricsProviderFallback = registry
  ? new Counter({
      name: 'provider_fallback_total',
      help: 'Fallback transitions between providers in a chain',
      labelNames: ['layer', 'from_provider', 'to_provider'],
      registers: [registry],
    })
  : null

export const collectMetricsProviderChainExhausted = registry
  ? new Counter({
      name: 'provider_chain_exhausted_total',
      help: 'All providers in a chain failed with infrastructure errors',
      labelNames: ['layer'],
      registers: [registry],
    })
  : null

export const collectMetricsProviderLatency = registry
  ? new Histogram({
      name: 'provider_latency_seconds',
      help: 'Individual provider response time',
      labelNames: ['provider', 'layer'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [registry],
    })
  : null

/**
 * Single source of truth for the `result` label. The value is granular and
 * derived purely from self-describing error metadata — no `instanceof` / type
 * matching. A new error subclass auto-contributes its `telemetryReason`.
 *
 * - ok + value  -> 'success'
 * - ok + null   -> 'not_found'
 * - err         -> error.telemetryReason ?? 'unknown'
 */
export function recordProviderRequest(
  layer: ProviderMetricLayer,
  provider: string,
  outcome: Result<unknown, AppError>,
): void {
  let result: string

  if (isOk(outcome)) {
    result = outcome.value == null ? TelemetryReason.NOT_FOUND : 'success'
  } else {
    result = outcome.error.telemetryReason ?? TelemetryReason.UNKNOWN
  }

  collectMetricsProviderRequest?.inc({ provider, layer, result })
}
