import { AxiosInstance } from 'axios'
import { createProviderHttpClient } from 'providers/helpers/provider-http-client'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { VIACEP_CONFIG } from 'messages/constants/providers/viacep'

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
  readonly timeoutMs = VIACEP_CONFIG.TIMEOUT_MS

  constructor(private readonly config: ViaCepConfig) {
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: VIACEP_CONFIG.TIMEOUT_MS,
    })
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    // The generic carries `| undefined` because that is the truth: axios types
    // `response.data` as the generic regardless of what the server sent, so a
    // 204, an empty body or a proxy error page all arrive typed as a valid
    // payload. Saying so is what makes the guard below necessary instead of
    // "unnecessary".
    const { data } = await this.api.get<ViaCepResponse | undefined>(`/${cleanCep}/json`, {
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
      providerName: 'ViaCEP',
      precision,
    }
  }
}
