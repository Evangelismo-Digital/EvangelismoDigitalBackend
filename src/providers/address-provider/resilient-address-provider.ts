import { logger } from '@lib/logger'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { NoAddressProviderError } from './error/no-address-provider-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Result, ok, errOf, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export class ResilientAddressProvider implements IAddressProvider {
  constructor(private readonly providers: IAddressProvider[]) {
    if (this.providers.length === 0) {
      throw new NoAddressProviderError()
    }
  }

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')
    const effectiveSignal = signal ?? new AbortController().signal

    let lastError: AppError | undefined = undefined
    let hasSystemError = false
    let lastProviderName = ''
    let notFoundCount = 0

    for (const [index, provider] of this.providers.entries()) {
      const providerName = provider.constructor.name

      // Defensive check
      if (effectiveSignal.aborted) {
        return errOf(new TimeoutExceededError(effectiveSignal.reason))
      }

      const result = await provider.fetchAddress(cleanCep, effectiveSignal)

      if (isOk(result)) {
        if (result.value) {
          logger.info({ provider: providerName }, 'Endereço obtido com sucesso por um provedor de endereço')
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

        if (error instanceof InvalidCepError) {
          notFoundCount++
          logger.info({ provider: providerName, cep: cleanCep }, 'CEP inválido reportado por provedor - tentando próximo')
          continue
        }

        // System errors: ServiceBusyError or ProviderFailureError
        hasSystemError = true
        lastError = error
        lastProviderName = providerName
        const errMsg = error.message

        if (error instanceof ServiceBusyError) {
          logger.warn(
            { provider: providerName, error: errMsg, attempt: index + 1 },
            'Provedor de endereço ocupado (429). Alternando para o próximo provedor...',
          )
        } else {
          logger.warn({ provider: providerName, error: errMsg }, 'Provedor falhou (Erro de Sistema). Alternando...')
        }
      }
    }

    // Decision phase
    if (hasSystemError && lastError) {
      logger.error(
        { cep: cleanCep, provider: lastProviderName, notFoundCount },
        'Provedores de endereço falharam com erros de sistema',
      )
      return errOf(lastError)
    }

    if (notFoundCount === this.providers.length) {
      logger.info(
        { cep: cleanCep, notFoundCount, totalProviders: this.providers.length },
        'TODOS os provedores confirmaram CEP inválido/não encontrado',
      )
      return errOf(new InvalidCepError())
    }

    return errOf(new ProviderFailureError('ResilientAddressProvider', new Error('TODOS os provedores falharam')))
  }
}
