import { AxiosInstance } from 'axios'
import { createProviderHttpClient } from 'providers/helpers/provider-http-client'
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

/**
 * One `/search` result, as Nominatim returns it.
 *
 * The request was previously untyped, so `response.data` was `any` and every
 * field read past it — `.length`, `[0]`, `.lat` — was unchecked. Coordinates
 * arrive as strings (the API serialises them that way), which is why they are
 * parsed rather than used directly.
 */
interface NominatimSearchResult {
  lat: string
  lon: string
  place_rank?: string | number
  type?: string
  class?: string
  addresstype?: string
}

export class NominatimGeoProvider implements IRawGeocodingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Nominatim'
  readonly rateLimitConfig = EnumProviderConfig.NOMINATIM_GEOCODING
  readonly maxRetries = NOMINATIM_CONFIG.MAX_RETRIES
  readonly backoffMs = NOMINATIM_CONFIG.BACKOFF_MS
  readonly timeoutMs = NOMINATIM_CONFIG.TIMEOUT_MS

  constructor(private readonly config: NominatimConfig) {
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: NOMINATIM_CONFIG.TIMEOUT_MS,
      userAgent: SHARED_PROVIDER_DEFAULTS.USER_AGENT_WITH_CONTACT,
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

    const response = await this.api.get<NominatimSearchResult[] | undefined>('/search', {
      params: cleanParams,
      signal,
    })

    const bestMatch = response.data?.[0]

    if (!bestMatch) {
      return null
    }

    return {
      lat: Number.parseFloat(bestMatch.lat),
      lon: Number.parseFloat(bestMatch.lon),
      precision: PrecisionHelper.fromOsm(bestMatch),
      providerName: 'Nominatim',
    }
  }

  private cleanParams(params: NominatimSearchParams): Record<string, string | number> {
    const cleaned: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(params)) {
      // `!= null` covers undefined AND null in one check the type system does
      // not consider redundant; the previous `!== null` was dead by the type
      // (`string | number | undefined`) while still being the guard that would
      // matter if a null ever arrived.
      if (value != null && value !== '') {
        cleaned[key] = value
      }
    }
    return cleaned
  }
}
