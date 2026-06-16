import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'

import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'

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
  private static api: AxiosInstance

  readonly providerName = 'ViaCEP'
  readonly rateLimitConfig = EnumProviderConfig.VIACEP_ADDRESS
  readonly maxRetries = 2
  readonly backoffMs = 200
  private readonly VIACEP_TIMEOUT = 3000

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(private readonly config: ViaCepConfig) {
    if (!ViaCepProvider.api) {
      ViaCepProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.VIACEP_TIMEOUT,
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
  }

  async fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    const { data } = await ViaCepProvider.api.get<ViaCepResponse>(`/${cleanCep}/json`, {
      signal,
    })

    if (!data || data.erro) {
      throw new InvalidCepError(cleanCep)
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
