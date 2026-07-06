import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { AWESOME_API_CONFIG } from 'messages/constants/providers/awesome-api'
import { SHARED_PROVIDER_DEFAULTS } from 'messages/constants/providers/shared'

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

  constructor(private readonly config: AwesomeApiConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: AWESOME_API_CONFIG.TIMEOUT_MS,
      headers: {
        'User-Agent': SHARED_PROVIDER_DEFAULTS.USER_AGENT,
      },
      agentOptions: {
        keepAliveMsecs: AWESOME_API_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: AWESOME_API_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: AWESOME_API_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: AWESOME_API_CONFIG.HTTPS_AGENT.TIMEOUT_MS,
      },
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    const { data } = await this.api.get<AwesomeApiResponse>(`/${cleanCep}`, {
      signal,
    })

    if (!data || !data.cep) {
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
      lat: parseFloat(data.lat),
      lon: parseFloat(data.lng),
      precision: precision,
      providerName: 'AwesomeAPI',
    }
  }
}
