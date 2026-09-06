import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IGeoCoordinates, IGeoSearchOptions } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { LOCATION_IQ_CONFIG } from 'messages/constants/providers/location-iq'

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

export class LocationIqProvider implements IRawGeocodingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'LocationIQ'
  readonly rateLimitConfig = EnumProviderConfig.LOCATION_IQ_GEOCODING
  readonly maxRetries = LOCATION_IQ_CONFIG.MAX_RETRIES
  readonly backoffMs = LOCATION_IQ_CONFIG.BACKOFF_MS
  readonly timeoutMs = LOCATION_IQ_CONFIG.TIMEOUT_MS

  constructor(private readonly config: LocationIqConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: LOCATION_IQ_CONFIG.TIMEOUT_MS,
      params: {
        key: this.config.apiToken,
        format: LOCATION_IQ_CONFIG.API_PARAMS.FORMAT,
      },
      agentOptions: {
        keepAliveMsecs: LOCATION_IQ_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: LOCATION_IQ_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: LOCATION_IQ_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: LOCATION_IQ_CONFIG.HTTPS_AGENT.TIMEOUT_MS,
      },
    })
  }

  async searchRaw(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest(
      {
        q: query,
        limit: LOCATION_IQ_CONFIG.API_PARAMS.SEARCH_LIMIT,
        addressdetails: LOCATION_IQ_CONFIG.API_PARAMS.ADDRESS_DETAILS,
      },
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
        limit: LOCATION_IQ_CONFIG.API_PARAMS.SEARCH_LIMIT,
        addressdetails: LOCATION_IQ_CONFIG.API_PARAMS.ADDRESS_DETAILS,
      },
      signal,
    )
  }

  private async performRequest(params: Record<string, unknown>, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    const response = await this.api.get<LocationIqResponseItem[]>('/search', {
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
  }
}
