import { AxiosError, AxiosInstance } from 'axios'
import Redis from 'ioredis'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { createHttpClient } from '@lib/http/axios'
import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { GeoServiceBusyError } from '@use-cases/errors/geo-service-busy-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'

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

  async getDistances({
    origin,
    destinations,
    profile,
    signal,
  }: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    signal?: AbortSignal
  }): Promise<RouteDistanceResult[]> {
    const results: RouteDistanceResult[] = []

    for (const destination of destinations) {
      results.push(await this.fetchDistance(origin, destination, profile, signal))
    }

    return results
  }

  private async fetchDistance(
    origin: RoutingPoint,
    destination: RoutingPoint,
    profile?: RoutingProfile,
    parentSignal?: AbortSignal,
  ): Promise<RouteDistanceResult> {
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
            throw new GeoServiceBusyError('Stadia Maps (Rate Limit Excedido)')
          }

          if (signal.aborted) {
            throw new TimeoutExceededOnFetchError(signal.reason)
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
        throw new Error('Falha ao calcular distância de rota com Stadia')
      }

      return result
    } catch (error) {
      if (error instanceof GeoServiceBusyError || error instanceof TimeoutExceededOnFetchError) {
        throw error
      }

      const axiosError = error as AxiosError
      const status = axiosError.response?.status

      if (status === 404) {
        return {
          distance: null,
          status,
        }
      }

      if (status === 429) {
        throw new GeoServiceBusyError('Stadia Maps (Rate Limit Excedido)')
      }

      if (axiosError.code === 'ERR_CANCELED') {
        throw new TimeoutExceededOnFetchError(axiosError.message)
      }

      throw error
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