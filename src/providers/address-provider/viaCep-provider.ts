import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { VIACEP_CONFIG } from 'messages/constants/providers/viacep'
import { SHARED_PROVIDER_DEFAULTS } from 'messages/constants/providers/shared'

export interface ViaCepConfig {
  apiUrl: string
}

interface ViaCepResponse {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  ibge: string
  gia: string
  ddd: string
  siafi: string
  erro?: boolean
}

export class ViaCepProvider implements IRawAddressProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'ViaCEP'
  readonly rateLimitConfig = EnumProviderConfig.VIACEP_ADDRESS
  readonly maxRetries = VIACEP_CONFIG.MAX_RETRIES
  readonly backoffMs = VIACEP_CONFIG.BACKOFF_MS

  constructor(private readonly config: ViaCepConfig) {
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: VIACEP_CONFIG.TIMEOUT_MS,
      headers: {
        'User-Agent': SHARED_PROVIDER_DEFAULTS.USER_AGENT,
      },
      agentOptions: {
        keepAliveMsecs: VIACEP_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: VIACEP_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: VIACEP_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: VIACEP_CONFIG.HTTPS_AGENT.TIMEOUT_MS,
      },
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    const { data } = await this.api.get<ViaCepResponse>(`/${cleanCep}/json`, {
      signal,
    })

    if (!data || data.erro) {
      return null
    }

    const precision = PrecisionHelper.fromAddressData(data)

    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      localidade: data.localidade,
      uf: data.uf,
      precision: precision,
      providerName: 'ViaCEP',
    }
  }
}
