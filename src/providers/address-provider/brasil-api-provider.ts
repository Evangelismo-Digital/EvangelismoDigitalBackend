import { AxiosInstance } from 'axios'
import { createProviderHttpClient } from 'providers/helpers/provider-http-client'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { BRASIL_API_CONFIG } from 'messages/constants/providers/brasil-api'

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
  readonly timeoutMs = BRASIL_API_CONFIG.TIMEOUT_MS

  constructor(private readonly config: BrasilApiConfig) {
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: BRASIL_API_CONFIG.TIMEOUT_MS,
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    // The generic carries `| undefined` because that is the truth: axios types
    // `response.data` as the generic regardless of what the server sent, so a
    // 204, an empty body or a proxy error page all arrive typed as a valid
    // payload. Saying so is what makes the guard below necessary instead of
    // "unnecessary".
    const { data } = await this.api.get<BrasilApiResponse | undefined>(`/${cleanCep}`, {
      signal,
    })

    if (!data?.cep || !data.city || !data.state) {
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
      precision,
      providerName: 'BrasilAPI',
    }
  }
}
