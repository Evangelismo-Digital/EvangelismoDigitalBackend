import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'

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
  readonly maxRetries = 2
  readonly backoffMs = 100
  private readonly TIMEOUT = 1500

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(private readonly config: BrasilApiConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: this.TIMEOUT,
      headers: {
        'User-Agent': 'EvangelismoDigitalBackend/1.0',
      },
      agentOptions: {
        keepAliveMsecs: this.KEEP_ALIVE_MSECS,
        maxSockets: this.MAX_SOCKETS,
        maxFreeSockets: this.MAX_FREE_SOCKETS,
        timeout: this.HTTPS_AGENT_TIMEOUT,
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
