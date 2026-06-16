import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import {
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'

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
  private static api: AxiosInstance

  readonly providerName = 'LocationIQ'
  readonly rateLimitConfig = EnumProviderConfig.LOCATION_IQ_GEOCODING
  readonly maxRetries = 2
  readonly backoffMs = 200
  private readonly TIMEOUT = 2000

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(private readonly config: LocationIqConfig) {
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

  async searchRaw(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null> {
    return this.performRequest({ q: query, limit: 1, addressdetails: 1 }, signal)
  }

  async searchStructuredRaw(
    options: IGeoSearchOptions,
    signal?: AbortSignal,
  ): Promise<IGeoCoordinates | null> {
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
  ): Promise<IGeoCoordinates | null> {
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
  }
}
