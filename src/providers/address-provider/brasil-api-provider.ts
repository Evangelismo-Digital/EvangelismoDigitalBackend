import { AxiosError, AxiosInstance } from 'axios'
import Redis from 'ioredis'
import { logger } from '@lib/logger'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'

export interface BrasilApiConfig {
  apiUrl: string // Esperado: https://brasilapi.com.br
}

// Interface baseada na resposta da BrasilAPI V1
// Ref: https://brasilapi.com.br/api/cep/v1/{cep}
interface BrasilApiResponse {
  cep: string
  state: string
  city: string
  neighborhood: string
  street: string
  service: string
}

export class BrasilApiProvider implements IAddressProvider {
  private static api: AxiosInstance

  // Configuração de Retry e Timeout
  private readonly MAX_RETRIES = 2
  private readonly BACKOFF_MS = 100
  private readonly TIMEOUT = 1500 // 1.5s timeout agressivo para Fail-Fast

  // HTTPS Agent Settings (Replicando configurações de performance do AwesomeApiProvider)
  private readonly KEEP_ALIVE_MSECS = 1000
  private readonly MAX_SOCKETS = 100
  private readonly MAX_FREE_SOCKETS = 10
  private readonly HTTPS_AGENT_TIMEOUT = 60000

  constructor(
    private readonly config: BrasilApiConfig,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    if (!BrasilApiProvider.api) {
      BrasilApiProvider.api = createHttpClient({
        baseURL: this.config.apiUrl, // A URL base deve vir do env, ex: https://brasilapi.com.br
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

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    // 1. Fail-Fast Rate Limit Check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

    // Usa a chave específica definida no EnumProviderConfig para BrasilAPI
    const allowed = await rateLimiter.tryConsume(EnumProviderConfig.BRASIL_API_ADDRESS)

    if (!allowed) {
      return errOf(new ServiceBusyError('BrasilAPI'))
    }

    let lastError: Error | unknown = undefined

    // 2. Lógica de Retry com Backoff
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      try {
        // A URL solicitada é /api/cep/v1/{cep}
        // Assumindo que o baseURL já é https://brasilapi.com.br, fazemos o append do path
        const { data } = await BrasilApiProvider.api.get<BrasilApiResponse>(`/${cleanCep}`, {
          signal,
        })

        if (!data || !data.cep || !data.city || !data.state) {
          return ok(null)
        }

        // 3. Normalização de Dados para o PrecisionHelper
        const normalizedData = {
          logradouro: data.street,
          bairro: data.neighborhood,
          localidade: data.city,
          uf: data.state,
        }

        // Calcula a precisão baseada na presença de logradouro/bairro
        const precision = PrecisionHelper.fromAddressData(normalizedData)

        return ok({
          ...normalizedData,
          precision: precision,
          providerName: 'BrasilAPI',
        })
      } catch (error) {
        // Tratamento de Abort/Timeout
        if (signal?.aborted) {
          return errOf(new TimeoutExceededError(signal.reason))
        }

        const err = error as AxiosError
        const status = err.response?.status

        // 404 significa CEP não encontrado na base deles
        if (status === 404) {
          logger.warn({ cep: cleanCep, attempt, status }, 'CEP não encontrado na BrasilAPI (404)')
          return errOf(new InvalidCepError())
        }

        lastError = error

        // Verifica erros retryable (5xx, 429 ou erro de rede)
        const isRetryable = !err.response || (typeof status === 'number' && (status >= 500 || status === 429))

        // Se não for retryable ou se esgotou as tentativas, falha.
        if (!isRetryable || attempt === this.MAX_RETRIES) {
          if (status === 429 && attempt === this.MAX_RETRIES) {
            return errOf(new ServiceBusyError('BrasilAPI'))
          }

          logger.error(
            {
              cep: cleanCep,
              attempt,
              status,
              code: err.code,
              name: err.name,
              url: err.config?.url,
            },
            'Falha ao buscar endereço BrasilAPI após tentativas',
          )
          return errOf(new ProviderFailureError('BrasilAPI', lastError))
        }

        // Backoff Exponencial
        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        logger.warn({ cep: cleanCep, attempt, delay, status }, 'Repetindo solicitação para BrasilAPI')
        await this.sleep(delay)
      }
    }

    // Fallback de segurança
    logger.error({ cep: cleanCep }, 'BrasilAPI - todas as tentativas esgotadas sem sucesso')
    return errOf(new ProviderFailureError('BrasilAPI', lastError))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
