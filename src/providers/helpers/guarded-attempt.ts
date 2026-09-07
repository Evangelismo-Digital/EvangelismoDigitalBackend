import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { Deadline } from 'core/shared/deadline'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runWithRetries } from 'providers/helpers/deadline-retry'
import { checkAdmission } from 'providers/helpers/provider-admission'
import {
  collectMetricsProviderLatency,
  recordProviderRequest,
  ProviderMetricLayer,
} from '@lib/metrics/provider-metrics'
import Redis from 'ioredis'

/**
 * One call to an external provider, behind the rate limiter and the retry
 * policy.
 *
 * All three decorators — address, geocoding, church routing — performed the
 * same two steps in the same order: ask the admission gate whether this call is
 * allowed, then run it under `runWithRetries` with settings read from the same
 * five fields of the raw provider. Each assembled those settings by hand, which
 * is why a copy-paste detector found ~31 duplicated lines across them, and why
 * a change to how providers are admitted had to be made in three places.
 *
 * The only genuine difference is metrics: routing has no chain above it to
 * record them, so it records its own. That is a parameter here, not a fork.
 */

/** The settings every raw provider exposes for its own resilience policy. */
interface GuardedProviderTraits {
  readonly providerName: string
  readonly rateLimitConfig: EnumProviderConfig
  readonly maxRetries: number
  readonly backoffMs: number
  readonly timeoutMs: number
}

export interface GuardedAttemptParams<T> {
  rawProvider: GuardedProviderTraits
  redis: Redis
  deadline: Deadline
  action: (attemptDeadline: Deadline) => Promise<T>
  logContext?: Record<string, unknown>
  /**
   * Record provider metrics from here.
   *
   * Set only by layers with no resilient chain above them. Where a chain exists
   * it already times and counts each provider, and doing it here as well would
   * double every measurement.
   */
  metricsLayer?: ProviderMetricLayer
}

export async function runGuardedAttempt<T>(params: GuardedAttemptParams<T>): Promise<Result<T, AppError>> {
  const { rawProvider, redis, deadline, metricsLayer } = params

  const admission = await checkAdmission({
    providerName: rawProvider.providerName,
    rateLimitConfig: rawProvider.rateLimitConfig,
    deadline,
    redis,
  })

  if (isErr(admission)) {
    // A refusal is still a request as far as the metrics are concerned: it is
    // the rate limiter's answer about this provider, and hiding it would make
    // a throttled provider look idle.
    if (metricsLayer) {
      recordProviderRequest(metricsLayer, rawProvider.providerName, admission)
    }

    return admission
  }

  return await attemptWithRetries(params)
}

async function attemptWithRetries<T>(params: GuardedAttemptParams<T>): Promise<Result<T, AppError>> {
  const { rawProvider, deadline, action, logContext, metricsLayer } = params

  const endTimer = metricsLayer
    ? collectMetricsProviderLatency?.startTimer({ provider: rawProvider.providerName, layer: metricsLayer })
    : undefined

  const outcome = await runWithRetries({
    providerName: rawProvider.providerName,
    maxAttempts: rawProvider.maxRetries,
    backoffMs: rawProvider.backoffMs,
    attemptTimeoutMs: rawProvider.timeoutMs,
    deadline,
    logContext,
    action,
  })

  endTimer?.()

  if (metricsLayer) {
    recordProviderRequest(metricsLayer, rawProvider.providerName, outcome)
  }

  return outcome
}
