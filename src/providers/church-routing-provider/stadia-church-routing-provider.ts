import { AxiosError, AxiosInstance } from 'axios'
import Redis from 'ioredis'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { createHttpClient } from '@lib/http/axios'
import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { ServiceOverloadError as CacheServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { TimeoutExceededOnFetchError as CacheTimeoutError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { resolveRoutingProviderError } from 'errors/mappings/axios-error-mapper'

interface StadiaChurchRoutingProviderConfig {
  apiUrl: string
  apiToken: string
  defaultCosting?: RoutingProfile
  timeoutMs?: number
}

interface StadiaRouteResponse {
  status?: number
  routes?: Array<{
    summary?: {
      length?: number
    }
  }>
  trip?: {
    summary?: {
      length?: number
    }
  }
  distance?: number
}

export class StadiaChurchRoutingProvider implements IChurchRoutingProvider {
  private static api: AxiosInstance

  private readonly cacheManager: ResilientCache
  private readonly timeoutMs: number

  constructor(
    private readonly config: StadiaChurchRoutingProviderConfig,
    private readonly redisRateLimiterConnection: Redis,
    redisCacheConnection: Redis,
    cacheOptions?: Partial<ResilientCacheOptions>,
  ) {
    this.timeoutMs = config.timeoutMs ?? 2_500

    if (!StadiaChurchRoutingProvider.api) {
      StadiaChurchRoutingProvider.api = createHttpClient({
        timeout: this.timeoutMs,
      })
    }

    this.cacheManager = new ResilientCache(redisCacheConnection, {
      prefix: cacheOptions?.prefix ?? 'cache:stadia-route-distance:',
      defaultTtlSeconds: cacheOptions?.defaultTtlSeconds ?? 60 * 60,
      // Route failures are infra-sensitive and should not be negative cached.
      negativeTtlSeconds: cacheOptions?.negativeTtlSeconds ?? 0,
      maxPendingFetches: cacheOptions?.maxPendingFetches ?? 500,
      fetchTimeoutMs: cacheOptions?.fetchTimeoutMs ?? this.timeoutMs,
      ttlJitterPercentage: cacheOptions?.ttlJitterPercentage ?? 0.05,
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
      if (!fetchResult.success) {
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
    try {
      const costing = this.resolveCosting(profile)
      const cacheKey = this.cacheManager.generateKey({
        oLat: origin.lat,
        oLon: origin.lon,
        dLat: destination.lat,
        dLon: destination.lon,
        profile: costing,
      })

      const result = await this.cacheManager.getOrFetch<RouteDistanceResult>(
        cacheKey,
        async (signal) => {
          const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)
          const allowed = await rateLimiter.tryConsume(EnumProviderConfig.STADIA_ROUTING)

          if (!allowed) {
            // Throw so ResilientCache knows it failed (and doesn't cache success envelope)
            throw new ServiceBusyError('Stadia Maps')
          }

          if (signal.aborted) {
            throw new TimeoutExceededError(signal.reason)
          }

          const response = await StadiaChurchRoutingProvider.api.post(
            this.config.apiUrl.replace(/\/$/, ''),
            {
              locations: [
                { lat: origin.lat, lon: origin.lon },
                { lat: destination.lat, lon: destination.lon },
              ],
              costing,
              directions_options: {
                units: 'kilometers',
              },
            },
            {
              headers: {
                Authorization: `Stadia-Auth ${this.config.apiToken}`,
                'Content-Type': 'application/json',
              },
              signal,
            },
          )

          const distance = this.extractDistanceKm(response.data)
          const status = response.data?.status

          if (distance == null || (typeof status === 'number' && status !== 0)) {
            return {
              distance: null,
              status: typeof status === 'number' ? status : 0,
            }
          }

          return {
            distance,
            status: typeof status === 'number' ? status : 0,
          }
        },
        undefined,
        parentSignal,
      )

      if (!result) {
        return errOf(
          new ProviderFailureError('Stadia Maps', ProviderLayer.Route, new Error('Falha ao calcular distância de rota com Stadia')),
        )
      }

      return ok(result)
    } catch (error) {
      // === Unwrap cache-layer errors internally — callers stay ignorant of CachedFailureError ===

      // CachedFailureError: a previously cached AppError is being replayed
      if (error instanceof CachedFailureError) {
        if (error.errorData instanceof AppError) {
          return errOf(error.errorData)
        }
        // Corrupted cache entry — treat as provider failure
        return errOf(new ProviderFailureError('Stadia Maps', ProviderLayer.Route, error))
      }

      // Cache infrastructure errors — translate to canonical AppErrors
      if (error instanceof CacheServiceOverloadError) {
        return errOf(new InfraServiceOverloadError())
      }

      if (error instanceof CacheTimeoutError) {
        return errOf(new TimeoutExceededError())
      }

      // AppErrors thrown from inside the fetcher (ServiceBusyError, TimeoutExceededError)
      if (error instanceof AppError) {
        return errOf(error)
      }

      // Axios errors from the HTTP call — map via lookup table
      const axiosError = error as AxiosError

      // 404 from routing API means the route could not be computed (unreachable),
      // not a true error — represent as null distance
      if (axiosError.response?.status === 404) {
        return ok({
          distance: null,
          status: 404,
        })
      }

      return errOf(resolveRoutingProviderError(axiosError, { provider: 'Stadia Maps', originalError: error }))
    }
  }

  private resolveCosting(profile?: RoutingProfile): RoutingProfile {
    return profile ?? this.config.defaultCosting ?? RoutingProfile.AUTO
  }

  private extractDistanceKm(responseData: StadiaRouteResponse): number | null {
    if (typeof responseData?.distance === 'number') {
      return responseData.distance
    }

    const routeLength = responseData?.routes?.[0]?.summary?.length
    if (typeof routeLength === 'number') {
      return routeLength
    }

    const tripLength = responseData?.trip?.summary?.length
    if (typeof tripLength === 'number') {
      return tripLength
    }

    return null
  }
}
