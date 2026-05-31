import { AxiosInstance, AxiosError } from 'axios'
import { Redis } from 'ioredis'
import { GeoServiceBusyError } from '@use-cases/errors/geo-service-busy-error'
import { createHttpClient } from '@lib/http/axios'
import { logger } from '@lib/logger'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { GeoProviderFailureError } from '@use-cases/errors/geo-provider-failure-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'

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

  // Configuração Fail-Fast in RedisRateLimiter: 2 requisições por segundo
  // RATE_LIMIT_MAX = 2
  // RATE_LIMIT_WINDOW = 1

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

  async search(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest({ q: query, limit: 1, addressdetails: 1 }, signal)
  }

  async searchStructured(options: IGeoSearchOptions, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
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

  private async performRequest(params: Record<string, unknown>, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    let lastError: Error | unknown = undefined

    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) {
        throw signal.reason
      }

      const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

      const allowed = await rateLimiter.tryConsume(EnumProviderConfig.LOCATION_IQ_GEOCODING)

      if (!allowed) {
        throw new GeoServiceBusyError('LocationIQ (Rate Limit Excedido)')
      }

      try {
        const response = await LocationIqProvider.api.get<LocationIqResponseItem[]>('/search', {
          params,
          signal,
        })

        if (!response.data || response.data.length === 0) {
          return null
        }

        const bestMatch = response.data[0]
        return {
          lat: parseFloat(bestMatch.lat),
          lon: parseFloat(bestMatch.lon),
          precision: PrecisionHelper.fromOsm(bestMatch),
          providerName: 'LocationIQ',
        }
      } catch (error) {
        if (signal?.aborted) {
          throw new TimeoutExceededOnFetchError(signal.reason)
        }

        // Se o erro foi o nosso BusyError (lançado acima), repassa imediatamente
        if (error instanceof GeoServiceBusyError) {
          throw error
        }

        const err = error as AxiosError
        const status = err.response?.status

        if (status === 404) {
          throw new CoordinatesNotFoundError()
        }

        // Store last error for potential re-throw
        lastError = error

        const isRetryable = !err.response || (status && (status >= 500 || status === 429))

        if (!isRetryable || attempt === this.MAX_ATTEMPTS) {
          if (status === 429 && attempt === this.MAX_ATTEMPTS) {
            throw new GeoServiceBusyError('LocationIQ (Rate Limit Excedido)')
          }

          logger.warn(
            {
              code: err.code,
              name: err.name,
              url: err.config?.url,
              method: err.config?.method,
            },
            'Provedor LocationIQ falhou ao buscar coordenadas',
          )
          throw new GeoProviderFailureError(lastError)
        }

        // Backoff apenas para erros de rede/servidor instável
        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        await this.sleep(delay)
      }
    }

    // This should be unreachable, but as a safety net, throw last error or generic error
    //logger.error({ lastError }, 'LocationIQ: Unexpected code path - all attempts exhausted without throw')
    throw new GeoProviderFailureError(lastError)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
