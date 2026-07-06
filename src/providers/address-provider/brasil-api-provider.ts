import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { BRASIL_API_CONFIG } from 'messages/constants/providers/brasil-api'
import { SHARED_PROVIDER_DEFAULTS } from 'messages/constants/providers/shared'

export interface BrasilApiConfig {
  apiUrl: string
}

interface BrasilApiResponse {
  cep: string
  state: string
  city: string
  neighborhood: string
  street: string
  service: string
}

export class BrasilApiProvider implements IRawAddressProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'BrasilAPI'
  readonly rateLimitConfig = EnumProviderConfig.BRASIL_API_ADDRESS
  readonly maxRetries = BRASIL_API_CONFIG.MAX_RETRIES
  readonly backoffMs = BRASIL_API_CONFIG.BACKOFF_MS

  constructor(private readonly config: BrasilApiConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: BRASIL_API_CONFIG.TIMEOUT_MS,
      headers: {
        'User-Agent': SHARED_PROVIDER_DEFAULTS.USER_AGENT,
      },
      agentOptions: {
        keepAliveMsecs: BRASIL_API_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: BRASIL_API_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: BRASIL_API_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: BRASIL_API_CONFIG.HTTPS_AGENT.TIMEOUT_MS,
      },
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    const { data } = await this.api.get<BrasilApiResponse>(`/${cleanCep}`, {
      signal,
    })

    if (!data || !data.cep || !data.city || !data.state) {
      return null
    }

    const normalizedData = {
      logradouro: data.street,
      bairro: data.neighborhood,
      localidade: data.city,
      uf: data.state,
    }

    const precision = PrecisionHelper.fromAddressData(normalizedData)

    return {
      ...normalizedData,
      precision: precision,
      providerName: 'BrasilAPI',
    }
  }
}
