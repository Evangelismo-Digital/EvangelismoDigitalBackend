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

interface NominatimConfig {
  apiUrl: string
}

type NominatimSearchParams = Record<string, string | number | undefined>

export class NominatimGeoProvider implements IGeocodingProvider {
  private static api: AxiosInstance

  // Nominatim API Timeout
  private readonly NOMINATIM_TIMEOUT = 4000

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(
    private readonly config: NominatimConfig,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    if (!NominatimGeoProvider.api) {
      NominatimGeoProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.NOMINATIM_TIMEOUT,
        headers: {
          'User-Agent': 'EvangelismoDigitalBackend/1.0 (contact@findhope.digital)',
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
    return this.performRequest({ q: query, limit: 1, format: 'json' }, signal)
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
        format: 'json',
      },
      signal,
    )
  }

  private async performRequest(
    params: NominatimSearchParams,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    try {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

      const allowed = await rateLimiter.tryConsume(EnumProviderConfig.NOMINATIM_GEOCODING)

      if (!allowed) {
        return errOf(new ServiceBusyError('Nominatim'))
      }

      const cleanParams = this.cleanParams(params)

      const response = await NominatimGeoProvider.api.get('/search', {
        params: cleanParams,
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
        providerName: 'Nominatim',
      })
    } catch (error) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      const err = error as AxiosError
      const { error: appError } = resolveGeoProviderError(err, {
        provider: 'Nominatim',
        originalError: error,
      })

      logger.warn(
        {
          code: err.code,
          name: err.name,
          url: err.config?.url,
          method: err.config?.method,
        },
        'Provedor Nominatim falhou ao buscar coordenadas',
      )

      return errOf(appError)
    }
  }

  private cleanParams(params: NominatimSearchParams): Record<string, string | number> {
    const cleaned: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key] = value
      }
    }
    return cleaned
  }
}
