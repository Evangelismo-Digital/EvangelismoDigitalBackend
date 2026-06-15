import { AxiosError, AxiosInstance } from 'axios'
import { Redis } from 'ioredis'
import { createHttpClient } from '@lib/http/axios'
import { logger } from '@lib/logger'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { resolveGeoProviderError } from 'errors/mappings/axios-error-mapper'

interface LocationIqConfig {
  apiUrl: string
  apiToken: string
}

type LocationIqResponseItem = {
  lat: string
  lon: string
  class: string
  type: string
  place_rank?: number
}

export class LocationIqProvider implements IGeocodingProvider {
  private static api: AxiosInstance

  // Timeout da API LocationIQ
  private readonly TIMEOUT = 2000
  private readonly MAX_ATTEMPTS = 2
  private readonly BACKOFF_MS = 200

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(
    private readonly config: LocationIqConfig,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    if (!LocationIqProvider.api) {
      LocationIqProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.TIMEOUT,
        params: {
          key: this.config.apiToken,
          format: 'json',
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT,
        },
      })
    }
  }

  async search(query: string, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>> {
    return this.performRequest({ q: query, limit: 1, addressdetails: 1 }, signal)
  }

  async searchStructured(
    options: IGeoSearchOptions,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: 1,
        addressdetails: 1,
      },
      signal,
    )
  }

  private async performRequest(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    let lastError: unknown = undefined

    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

      const allowed = await rateLimiter.tryConsume(EnumProviderConfig.LOCATION_IQ_GEOCODING)

      if (!allowed) {
        return errOf(new ServiceBusyError('LocationIQ'))
      }

      try {
        const response = await LocationIqProvider.api.get<LocationIqResponseItem[]>('/search', {
          params,
          signal,
        })

        if (!response.data || response.data.length === 0) {
          return ok(null)
        }

        const bestMatch = response.data[0]
        return ok({
          lat: parseFloat(bestMatch.lat),
          lon: parseFloat(bestMatch.lon),
          precision: PrecisionHelper.fromOsm(bestMatch),
          providerName: 'LocationIQ',
        })
      } catch (error) {
        if (signal?.aborted) {
          return errOf(new TimeoutExceededError(signal.reason))
        }

        lastError = error
        const err = error as AxiosError
        const { error: appError, shouldRetry } = resolveGeoProviderError(err, {
          provider: 'LocationIQ',
          originalError: lastError,
        })

        if (!shouldRetry || attempt === this.MAX_ATTEMPTS) {
          logger.warn(
            {
              code: err.code,
              name: err.name,
              url: err.config?.url,
              method: err.config?.method,
            },
            'Provedor LocationIQ falhou ao buscar coordenadas',
          )
          return errOf(appError)
        }

        // Backoff apenas para erros de rede/servidor instável
        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        await this.sleep(delay)
      }
    }

    return errOf(new ServiceBusyError('LocationIQ'))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
