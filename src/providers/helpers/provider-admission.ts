import Redis from 'ioredis'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'

/**
 * The gate every decorated provider passes before doing any work.
 *
 * Order is the point: the budget is checked **before** a rate-limit point is
 * consumed. Consuming first — as all three decorators used to — meant an
 * already-doomed request still spent quota that is genuinely scarce (ViaCEP and
 * Nominatim allow one request per second), penalising the live requests queued
 * behind it.
 */
export async function checkAdmission(params: {
  deadline: Deadline
  providerName: string
  rateLimitConfig: EnumProviderConfig
  redis: Redis
}): Promise<Result<void, AppError>> {
  const { deadline, providerName, rateLimitConfig, redis } = params

  if (deadline.expired) {
    return err(deadline.asError())
  }

  const allowed = await RedisRateLimiter.getInstance(redis).tryConsume(rateLimitConfig)

  if (!allowed) {
    return err(new ServiceBusyError(providerName))
  }

  return ok(undefined)
}
