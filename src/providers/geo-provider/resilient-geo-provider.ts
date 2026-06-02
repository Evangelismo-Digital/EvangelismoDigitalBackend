import { logger } from '@lib/logger'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { Result, ok, errOf, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export class ResilientGeoProvider implements IGeocodingProvider {
  constructor(private readonly providers: IGeocodingProvider[]) {
    if (this.providers.length === 0) {
      throw new NoGeoProviderError()
    }
  }

  async search(query: string, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>> {
    const effectiveSignal = signal ?? new AbortController().signal
    return await this.executeStrategy(
      (provider, innerSignal) => provider.search(query, innerSignal),
      effectiveSignal,
    )
  }

  async searchStructured(options: IGeoSearchOptions, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>> {
    const effectiveSignal = signal ?? new AbortController().signal
    return await this.executeStrategy(
      (provider, innerSignal) => provider.searchStructured(options, innerSignal),
      effectiveSignal,
    )
  }

  private async executeStrategy(
    action: (provider: IGeocodingProvider, signal: AbortSignal) => Promise<Result<IGeoCoordinates | null, AppError>>,
    signal: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    let lastError: AppError | undefined = undefined
    let hasSystemError = false
    let lastProviderName = ''
    let notFoundCount = 0

    for (const [index, provider] of this.providers.entries()) {
      const providerName = provider.constructor.name

      // Defensive Check
      if (signal.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      const result = await action(provider, signal)

      if (isOk(result)) {
        if (result.value !== null) {
          logger.info({ provider: providerName }, 'Geocodificação obtida com sucesso por um provedor de geocodificação')
          return ok(result.value)
        }
        // Provider returned null (not found)
        notFoundCount++
        logger.info({ provider: providerName }, 'Provedor retornou null (não encontrado) - tentando próximo')
      } else {
        const error = result.error

        if (error instanceof TimeoutExceededError) {
          return errOf(error)
        }

        if (error instanceof CoordinatesNotFoundError) {
          notFoundCount++
          logger.info({ provider: providerName }, 'Coordenadas não encontradas - tentando próximo')
          continue
        }

        // System errors
        hasSystemError = true
        lastError = error
        lastProviderName = providerName
        const errMsg = error.message

        if (error instanceof ServiceBusyError) {
          logger.warn(
            { provider: providerName, attempt: index + 1 },
            'Provedor de geocodificação ocupado (429). Alternando para o próximo provedor...',
          )
        } else {
          logger.warn({ provider: providerName, error: errMsg }, 'Provedor falhou (Erro de Sistema). Alternando...')
        }
      }
    }

    // Decision phase
    if (hasSystemError && lastError) {
      logger.error({ provider: lastProviderName }, 'Geocodificação falhou com erros de sistema')
      return errOf(lastError)
    }

    if (notFoundCount === this.providers.length) {
      logger.info('Nenhum provedor retornou resultados - coordenadas não encontradas')
      return errOf(new CoordinatesNotFoundError())
    }

    return errOf(new ProviderFailureError('ResilientGeoProvider', new Error('TODOS os provedores falharam')))
  }
}
