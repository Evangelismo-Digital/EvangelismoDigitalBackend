import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { Deadline } from 'core/shared/deadline'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runWithRetries } from 'providers/helpers/deadline-retry'
import { checkAdmission } from 'providers/helpers/provider-admission'
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
 * Metrics are not recorded here: every layer now has a resilient chain above
 * it, and the chain times and counts each provider. Recording here as well
 * would double every measurement.
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
}

export async function runGuardedAttempt<T>(params: GuardedAttemptParams<T>): Promise<Result<T, AppError>> {
  const { rawProvider, redis, deadline, action, logContext } = params

  const admission = await checkAdmission({
    providerName: rawProvider.providerName,
    rateLimitConfig: rawProvider.rateLimitConfig,
    deadline,
    redis,
  })

  if (isErr(admission)) {
    return admission
  }

  return await runWithRetries({
    providerName: rawProvider.providerName,
    maxAttempts: rawProvider.maxRetries,
    backoffMs: rawProvider.backoffMs,
    attemptTimeoutMs: rawProvider.timeoutMs,
    deadline,
    logContext,
    action,
  })
}
