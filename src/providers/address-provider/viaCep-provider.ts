import { AxiosError, AxiosInstance } from 'axios'
import { logger } from '@lib/logger'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig, RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { PrecisionHelper } from 'providers/helpers/precision-helper'
import Redis from 'ioredis'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { resolveAddressProviderError } from 'errors/mappings/axios-error-mapper'

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

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    // Fail-Fast Rate Limit Check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

    const allowed = await rateLimiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

    if (!allowed) {
      return errOf(new ServiceBusyError('ViaCEP'))
    }

    let lastError: unknown = undefined

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      try {
        const { data } = await ViaCepProvider.api.get<ViaCepResponse>(`/${cleanCep}/json`, {
          signal,
        })

        if (!data || data.erro) {
          return ok(null)
        }

        const precision = PrecisionHelper.fromAddressData(data)

        return ok({
          logradouro: data.logradouro,
          bairro: data.bairro,
          localidade: data.localidade,
          uf: data.uf,
          precision: precision,
          providerName: 'ViaCEP',
        })
      } catch (error) {
        if (signal?.aborted) {
          return errOf(new TimeoutExceededError(signal.reason))
        }

        lastError = error
        const err = error as AxiosError
        const { error: appError, shouldRetry } = resolveAddressProviderError(err, {
          provider: 'ViaCEP',
          originalError: lastError,
        })

        if (!shouldRetry || attempt === this.MAX_RETRIES) {
          logger.error(
            {
              cep: cleanCep,
              attempt,
              status: err.response?.status,
              code: err.code,
              name: err.name,
              url: err.config?.url,
              method: err.config?.method,
            },
            'Falha ao buscar endereço após tentativas (ViaCEP)',
          )
          return errOf(appError)
        }

        const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
        logger.warn(
          {
            cep: cleanCep,
            attempt,
            delay,
            status: err.response?.status,
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
    return errOf(new ServiceBusyError('ViaCEP'))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
