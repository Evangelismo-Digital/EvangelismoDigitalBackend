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

export class ViaCepProvider implements IAddressProvider {
  private static api: AxiosInstance

  private readonly MAX_RETRIES = 2
  private readonly BACKOFF_MS = 200
  private readonly VIACEP_TIMEOUT = 3000

  // HTTPS Agent Settings
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(
    private readonly config: ViaCepConfig,
    private readonly redisRateLimiterConnection: Redis,
  ) {
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

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null> {
    const cleanCep = cep.replace(/\D/g, '')

    // Fail-Fast Rate Limit Check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

    const allowed = await rateLimiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

    if (!allowed) {
      throw new AddressServiceBusyError('ViaCEP (Rate Limit Excedido)')
    }

    let lastError: Error | unknown = undefined

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw signal.reason
      }

      try {
        const { data } = await ViaCepProvider.api.get<ViaCepResponse>(`/${cleanCep}/json`, {
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
      } catch (error) {
        if (signal?.aborted) {
          throw new TimeoutExceededOnFetchError(signal.reason)
        }

        // Se for erro de Rate Limit, propaga
        if (error instanceof AddressServiceBusyError) {
          throw error
        }

        const err = error as AxiosError
        const status = err.response?.status

        // 404 (raro no ViaCEP, geralmente retorna 200 com erro: true, mas tratamos por segurança)
        if (status === 404) {
          logger.warn({ cep: cleanCep, attempt, status }, 'CEP não encontrado na ViaCEP (404)')
          throw new InvalidCepError()
        }

        lastError = error

        // Retry logic para erros de rede, 500 ou 429
        const isRetryable = !err.response || (typeof status === 'number' && (status >= 500 || status === 429))

        if (!isRetryable || attempt === this.MAX_RETRIES) {
          if (status === 429 && attempt === this.MAX_RETRIES) {
            throw new AddressServiceBusyError('ViaCEP (Rate Limit Excedido)')
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
            'Falha ao buscar endereço após tentativas (ViaCEP)',
          )

          throw new AddressProviderFailureError(lastError)
        }

        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        logger.warn(
          {
            cep: cleanCep,
            attempt,
            delay,
            status,
            code: err.code,
            name: err.name,
            url: err.config?.url,
            method: err.config?.method,
          },
          'Repetindo solicitação para ViaCEP',
        )

        await this.sleep(delay)
      }
    }

    logger.error({ cep: cleanCep }, 'ViaCEP - todas as tentativas esgotadas sem sucesso')
    throw new AddressProviderFailureError(lastError)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
