import { AxiosInstance } from 'axios'
import { createProviderHttpClient } from 'providers/helpers/provider-http-client'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { AWESOME_API_CONFIG } from 'messages/constants/providers/awesome-api'

export interface AwesomeApiConfig {
  apiUrl: string
  apiToken: string
}

interface AwesomeApiResponse {
  cep: string
  address_type: string
  address_name: string
  address: string
  state: string
  district: string
  lat: string
  lng: string
  city: string
  city_ibge: string
  ddd: string
}

export class AwesomeApiProvider implements IRawAddressProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'AwesomeAPI'
  readonly rateLimitConfig = EnumProviderConfig.AWESOME_API_ADDRESS
  readonly maxRetries = AWESOME_API_CONFIG.MAX_RETRIES
  readonly backoffMs = AWESOME_API_CONFIG.BACKOFF_MS
  readonly timeoutMs = AWESOME_API_CONFIG.TIMEOUT_MS

  constructor(private readonly config: AwesomeApiConfig) {
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: AWESOME_API_CONFIG.TIMEOUT_MS,
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    // The generic carries `| undefined` because that is the truth: axios types
    // `response.data` as the generic regardless of what the server sent, so a
    // 204, an empty body or a proxy error page all arrive typed as a valid
    // payload. Saying so is what makes the guard below necessary instead of
    // "unnecessary".
    const { data } = await this.api.get<AwesomeApiResponse | undefined>(`/${cleanCep}`, {
      signal,
    })

    if (!data?.cep) {
      return null
    }

    const normalizedData = {
      logradouro: data.address_name,
      bairro: data.district,
      localidade: data.city,
      uf: data.state,
    }

    const precision = PrecisionHelper.fromAddressData(normalizedData)

    return {
      logradouro: data.address_name,
      bairro: data.district,
      localidade: data.city,
      uf: data.state,
      lat: Number.parseFloat(data.lat),
      lon: Number.parseFloat(data.lng),
      providerName: 'AwesomeAPI',
      precision,
    }
  }
}
