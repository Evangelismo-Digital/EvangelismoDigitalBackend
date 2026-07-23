import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { collectMetricsProviderLatency, recordProviderRequest } from '@lib/metrics/provider-metrics'
import Redis from 'ioredis'

export class ResilientChurchRoutingProviderDecorator implements IChurchRoutingProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawChurchRoutingProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  async getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    signal?: AbortSignal
  }): Promise<Result<RouteDistanceResult[], AppError>> {
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)
    const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig)

    if (!allowed) {
      const busy = err(new ServiceBusyError(this.rawProvider.providerName))
      recordProviderRequest('routing', this.providerName, busy)
      return busy
    }

    if (params.signal?.aborted) {
      const timedOut = err(new TimeoutExceededError(params.signal.reason))
      recordProviderRequest('routing', this.providerName, timedOut)
      return timedOut
    }

    const endTimer = collectMetricsProviderLatency?.startTimer({ provider: this.providerName, layer: 'routing' })
    try {
      const costing = params.profile ?? this.rawProvider.defaultCosting ?? RoutingProfile.AUTO
      const results = await this.rawProvider.fetchRawDistances(
        params.origin,
        params.destinations,
        costing,
        params.signal,
      )
      endTimer?.()
      const success = ok(results)
      recordProviderRequest('routing', this.providerName, success)
      return success
    } catch (error) {
      endTimer?.()
      const failure = err(FindNearestChurchesErrorMapper.map(error))
      recordProviderRequest('routing', this.providerName, failure)
      return failure
    }
  }
}
