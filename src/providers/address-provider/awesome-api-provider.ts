import { AxiosInstance } from 'axios'
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
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

export interface AwesomeApiConfig {
  apiUrl: string
  apiToken: string
}

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

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    // Fail-Fast Rate Limit Check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)

    const allowed = await rateLimiter.tryConsume(EnumProviderConfig.AWESOME_API_ADDRESS)

    if (!allowed) {
      return errOf(new ServiceBusyError('AwesomeAPI'))
    }

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      const result = await FindNearestChurchesErrorMapper.runCatching<IAddressData | null>(async () => {
        const { data } = await AwesomeApiProvider.api.get<AwesomeApiResponse>(`/${cleanCep}`, {
          signal,
        })

        if (!data || !data.cep) {
          return ok(null)
        }

        const normalizedData = {
          logradouro: data.address_name,
          bairro: data.district,
          localidade: data.city,
          uf: data.state,
        }

        const precision = PrecisionHelper.fromAddressData(normalizedData)

        return ok({
          logradouro: data.address_name,
          bairro: data.district,
          localidade: data.city,
          uf: data.state,
          lat: parseFloat(data.lat),
          lon: parseFloat(data.lng),
          precision: precision,
          providerName: 'AwesomeAPI',
        })
      })

      if (result.success) {
        return result
      }

      const error = result.error
      const isRetryable = error.failureMode === FailureMode.RETRYABLE

      if (!isRetryable || attempt === this.MAX_RETRIES) {
        logger.error(
          {
            cep: cleanCep,
            attempt,
            error: error.message,
          },
          'Falha ao buscar endereço AwesomeAPI após tentativas',
        )
        return errOf(error)
      }

      // Backoff and retry for transient errors
      const delay = this.BACKOFF_MS * Math.pow(2, attempt - 1)
      logger.warn({ cep: cleanCep, attempt, delay }, 'Repetindo solicitação para AwesomeAPI')
      await this.sleep(delay)
    }

    logger.error({ cep: cleanCep }, 'AwesomeAPI - todas as tentativas esgotadas sem sucesso')
    return errOf(new ServiceBusyError('AwesomeAPI'))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
