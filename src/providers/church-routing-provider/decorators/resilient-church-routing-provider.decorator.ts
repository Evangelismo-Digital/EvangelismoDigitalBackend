import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import Redis from 'ioredis'

export class ResilientChurchRoutingProviderDecorator implements IChurchRoutingProvider {
  private readonly cacheManager: ResilientCache<AppError>
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawChurchRoutingProvider,
    private readonly redisRateLimiterConnection: Redis,
    redisCacheConnection: Redis,
    cacheOptionsOverride?: ResilientCacheOptions<AppError>,
  ) {
    this.providerName = rawProvider.providerName
    const timeoutMs = rawProvider.timeoutMs
    const defaults = CACHE_CONFIG.STADIA_ROUTE_DECORATOR_DEFAULTS
    this.cacheManager = new ResilientCache<AppError>(redisCacheConnection, {
      prefix: cacheOptionsOverride?.prefix ?? defaults.PREFIX,
      defaultTtlSeconds: cacheOptionsOverride?.defaultTtlSeconds ?? defaults.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: cacheOptionsOverride?.negativeTtlSeconds ?? defaults.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: cacheOptionsOverride?.maxPendingFetches ?? defaults.MAX_PENDING_FETCHES,
      fetchTimeoutMs: cacheOptionsOverride?.fetchTimeoutMs ?? timeoutMs,
      ttlJitterPercentage: cacheOptionsOverride?.ttlJitterPercentage ?? defaults.TTL_JITTER_PERCENTAGE,
      serializeError: cacheOptionsOverride?.serializeError,
      deserializeError: cacheOptionsOverride?.deserializeError,
      isRetryable: cacheOptionsOverride?.isRetryable,
    })
  }

  async getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    signal?: AbortSignal
  }): Promise<Result<RouteDistanceResult[], AppError>> {
    const results: RouteDistanceResult[] = []

    for (const destination of params.destinations) {
      const fetchResult = await this.fetchDistance(params.origin, destination, params.profile, params.signal)
      if (isErr(fetchResult)) {
        return fetchResult
      }
      results.push(fetchResult.value)
    }

    return ok(results)
  }

  private async fetchDistance(
    origin: RoutingPoint,
    destination: RoutingPoint,
    profile?: RoutingProfile,
    parentSignal?: AbortSignal,
  ): Promise<Result<RouteDistanceResult, AppError>> {
    const costing = profile ?? this.rawProvider.defaultCosting ?? RoutingProfile.AUTO
    const cacheKey = this.cacheManager.generateKey({
      oLat: origin.lat,
      oLon: origin.lon,
      dLat: destination.lat,
      dLon: destination.lon,
      profile: costing,
    })

    const result = await this.cacheManager.getOrFetch<RouteDistanceResult>(
      cacheKey,
      async (signal: AbortSignal) => {
        const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)
        const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig)

        if (!allowed) {
          return err(new ServiceBusyError(this.rawProvider.providerName))
        }

        if (signal.aborted) {
          return err(new TimeoutExceededError(signal.reason))
        }

        try {
          const data = await this.rawProvider.fetchRawDistance(origin, destination, costing, signal)
          return ok(data)
        } catch (error) {
          return err(FindNearestChurchesErrorMapper.map(error))
        }
      },
      parentSignal,
    )

    return result
  }
}
