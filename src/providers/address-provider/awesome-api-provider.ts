import { AxiosError, AxiosInstance } from 'axios'
import { logger } from '@lib/logger'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { AddressServiceBusyError } from '@use-cases/errors/address-service-busy-error'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import Redis from 'ioredis'
import { AddressProviderFailureError } from './error/address-provider-failure-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'

export interface AwesomeApiConfig {
  apiUrl: string
  apiToken: string
}

// [MUDANÇA 2] Garantir que a interface da resposta da API esteja definida
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

export class AwesomeApiProvider implements IAddressProvider {
  private static api: AxiosInstance

  private readonly MAX_RETRIES = 2
  private readonly BACKOFF_MS = 100
  private readonly TIMEOUT = 1500

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(
    private readonly config: AwesomeApiConfig,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    if (!AwesomeApiProvider.api) {
      AwesomeApiProvider.api = createHttpClient({
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
  }

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    // Fail-Fast Rate Limit Check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

    const allowed = await rateLimiter.tryConsume(EnumProviderConfig.AWESOME_API_ADDRESS)

    if (!allowed) {
      throw new AddressServiceBusyError('AwesomeAPI (Rate Limit Excedido)')
    }

    let lastError: Error | unknown = undefined

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw signal.reason
      }

      try {
        const { data } = await AwesomeApiProvider.api.get<AwesomeApiResponse>(`/${cleanCep}`, {
          signal,
        })

        if (!data || !data.cep) {
          return null
        }

        // [MUDANÇA 3] Normalizar dados para o PrecisionHelper
        // A AwesomeAPI usa 'address_name' para rua e 'district' para bairro
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
      } catch (error) {
        if (signal?.aborted) {
          throw new TimeoutExceededOnFetchError(signal.reason)
        }

        if (error instanceof AddressServiceBusyError) {
          throw error
        }

        const err = error as AxiosError
        const status = err.response?.status

        // 404 means CEP not found - return null to try next provider
        if (status === 404) {
          logger.warn({ cep: cleanCep, attempt, status }, 'CEP não encontrado na AwesomeAPI (404)')
          throw new InvalidCepError()
        }

        lastError = error

        // Check if error is retryable (network issues, 5xx, 429)
        const isRetryable = !err.response || (typeof status === 'number' && (status >= 500 || status === 429))

        if (!isRetryable || attempt === this.MAX_RETRIES) {
          if (status === 429 && attempt === this.MAX_RETRIES) {
            throw new AddressServiceBusyError('AwesomeAPI (Rate Limit Excedido)')
          }

          logger.error(
            {
              cep: cleanCep,
              attempt,
              status,
              code: err.code,
              name: err.name,
              url: err.config?.url,
              method: err.config?.method,
            },
            'Falha ao buscar endereço AwesomeAPI após tentativas',
          )
          throw new AddressProviderFailureError(lastError)
        }

        // Backoff and retry for transient errors
        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        logger.warn({ cep: cleanCep, attempt, delay, status }, 'Repetindo solicitação para AwesomeAPI')
        await this.sleep(delay)
      }
    }

    // This should be unreachable due to retry logic, but as safety net
    logger.error({ cep: cleanCep }, 'AwesomeAPI - todas as tentativas esgotadas sem sucesso')
    throw new AddressProviderFailureError(lastError)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
