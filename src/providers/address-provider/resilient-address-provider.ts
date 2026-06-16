import { logger } from '@lib/logger'
import { NoAddressProviderError } from './error/no-address-provider-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Result, ok, errOf, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

/**
 * ResilientAddressProvider chains multiple `IAddressProvider` implementations
 * and advances to the next provider whenever the current one returns a
 * `RETRYABLE` failure mode.  It bails immediately for any other failure mode
 * (NOT_FOUND, unknown / no failure mode).
 *
 * No `instanceof` checks are used — routing is driven purely by
 * `error.failureMode`.
 */
export class ResilientAddressProvider implements IAddressProvider {
  constructor(private readonly providers: IAddressProvider[]) {
    if (this.providers.length === 0) {
      throw new NoAddressProviderError()
    }
  }

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')
    const effectiveSignal = signal ?? new AbortController().signal

    let lastRetryableError: AppError | undefined = undefined
    let lastProviderName = ''
    let notFoundCount = 0

    for (const [index, provider] of this.providers.entries()) {
      const providerName = (provider as { providerName?: string }).providerName ?? provider.constructor.name

      // Defensive check — honour abort before each provider attempt
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
        continue
      }

      const error = result.error

      // NOT_FOUND: resource genuinely missing — treat same as null response
      if (error.failureMode === FailureMode.NOT_FOUND) {
        notFoundCount++
        logger.info(
          { provider: providerName, cep: cleanCep },
          'Provedor confirmou que o recurso não existe - tentando próximo',
        )
        continue
      }

      // RETRYABLE: transient infra error — log and advance to next provider
      if (error.failureMode === FailureMode.RETRYABLE) {
        lastRetryableError = error
        lastProviderName = providerName
        logger.warn(
          { provider: providerName, error: error.message, attempt: index + 1 },
          'Provedor de endereço retornou erro recuperável. Alternando para o próximo provedor...',
        )
        continue
      }

      // Unknown / fatal error — bail immediately without trying other providers
      logger.error({ provider: providerName, error: error.message }, 'Provedor retornou erro fatal. Abortando cadeia.')
      return errOf(error)
    }

    // Decision phase: all providers exhausted
    if (notFoundCount === this.providers.length) {
      // Every provider confirmed the resource does not exist
      logger.warn(
        { cep: cleanCep, notFoundCount, totalProviders: this.providers.length },
        'TODOS os provedores confirmaram CEP inválido/não encontrado',
      )
      return errOf(new InvalidCepError())
    }

    if (lastRetryableError) {
      logger.error(
        { cep: cleanCep, provider: lastProviderName, notFoundCount },
        'Provedores de endereço falharam com erros de sistema',
      )
      return errOf(lastRetryableError)
    }

    return errOf(
      new ProviderFailureError(
        'ResilientAddressProvider',
        ProviderLayer.Address,
        new Error('TODOS os provedores falharam'),
      ),
    )
  }
}
