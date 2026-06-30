import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IGeoCoordinates, IGeoSearchOptions } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'

interface NominatimConfig {
  apiUrl: string
}

type NominatimSearchParams = Record<string, string | number | undefined>

export class NominatimGeoProvider implements IRawGeocodingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Nominatim'
  readonly rateLimitConfig = EnumProviderConfig.NOMINATIM_GEOCODING
  readonly maxRetries = 2
  readonly backoffMs = 200
  private readonly NOMINATIM_TIMEOUT = 4000

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(private readonly config: NominatimConfig) {
    this.api = createHttpClient({
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

  async searchRaw(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest({ q: query, limit: 1, format: 'json' }, signal)
  }

  async searchStructuredRaw(options: IGeoSearchOptions, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
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

  private async performRequest(params: NominatimSearchParams, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    const cleanParams = this.cleanParams(params)

    const response = await this.api.get('/search', {
      params: cleanParams,
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
      providerName: 'Nominatim',
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
