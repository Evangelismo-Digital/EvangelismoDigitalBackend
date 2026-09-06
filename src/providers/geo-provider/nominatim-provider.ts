import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IGeoCoordinates, IGeoSearchOptions } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { NOMINATIM_CONFIG } from 'messages/constants/providers/nominatim'
import { SHARED_PROVIDER_DEFAULTS } from 'messages/constants/providers/shared'

interface NominatimConfig {
  apiUrl: string
}

type NominatimSearchParams = Record<string, string | number | undefined>

export class NominatimGeoProvider implements IRawGeocodingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Nominatim'
  readonly rateLimitConfig = EnumProviderConfig.NOMINATIM_GEOCODING
  readonly maxRetries = NOMINATIM_CONFIG.MAX_RETRIES
  readonly backoffMs = NOMINATIM_CONFIG.BACKOFF_MS
  readonly timeoutMs = NOMINATIM_CONFIG.TIMEOUT_MS

  constructor(private readonly config: NominatimConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: NOMINATIM_CONFIG.TIMEOUT_MS,
      headers: {
        'User-Agent': SHARED_PROVIDER_DEFAULTS.USER_AGENT_WITH_CONTACT,
      },
      agentOptions: {
        keepAliveMsecs: NOMINATIM_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: NOMINATIM_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: NOMINATIM_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: NOMINATIM_CONFIG.HTTPS_AGENT.TIMEOUT_MS,
      },
    })
  }

  async searchRaw(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest(
      { q: query, limit: NOMINATIM_CONFIG.API_PARAMS.SEARCH_LIMIT, format: NOMINATIM_CONFIG.API_PARAMS.FORMAT },
      signal,
    )
  }

  async searchStructuredRaw(options: IGeoSearchOptions, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: NOMINATIM_CONFIG.API_PARAMS.SEARCH_LIMIT,
        format: NOMINATIM_CONFIG.API_PARAMS.FORMAT,
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
