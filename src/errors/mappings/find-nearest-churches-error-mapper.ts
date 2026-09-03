import { Result, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { AxiosError, isAxiosError } from 'axios'
import { Prisma } from '@prisma/client'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'

/** URL fragment -> human-readable provider name, most specific first. */
const PROVIDER_BY_URL_FRAGMENT: ReadonlyArray<readonly [string, string]> = [
  ['viacep', 'ViaCEP'],
  ['awesomeapi', 'AwesomeAPI'],
  ['brasilapi', 'BrasilAPI'],
  ['nominatim', 'Nominatim'],
  ['locationiq', 'LocationIQ'],
  ['stadia', 'Stadia Maps'],
]

/** Providers that resolve a CEP, so a 404 from them means the CEP is invalid. */
const ADDRESS_URL_FRAGMENTS = ['viacep', 'awesomeapi', 'brasilapi']

const TIMEOUT_CODES = ['ERR_CANCELED', 'ECONNABORTED']

export class FindNearestChurchesErrorMapper {
  static async runCatching<T>(fn: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    try {
      return await fn()
    } catch (error) {
      return err(FindNearestChurchesErrorMapper.map(error))
    }
  }

  static map(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (FindNearestChurchesErrorMapper.isAxiosError(error)) {
      return FindNearestChurchesErrorMapper.mapAxiosError(error as AxiosError)
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return new DatabaseQueryError(error)
    }

    return new ProviderFailureError(error instanceof Error ? error : new Error(String(error)))
  }

  private static mapAxiosError(error: AxiosError): AppError {
    const status = error.response?.status

    if (status === 429) {
      return new ServiceBusyError(FindNearestChurchesErrorMapper.detectProvider(error))
    }

    if (FindNearestChurchesErrorMapper.isTimeout(error)) {
      return new TimeoutExceededError(error.message)
    }

    if (status === 404) {
      return FindNearestChurchesErrorMapper.mapNotFound(error)
    }

    return new ProviderFailureError(error)
  }

  /**
   * A 404 from an address provider means the CEP itself does not exist; from a
   * geocoder it means the address could not be placed on the map.
   */
  private static mapNotFound(error: AxiosError): AppError {
    const url = error.config?.url || ''

    if (ADDRESS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return new InvalidCepError(FindNearestChurchesErrorMapper.extractCep(url))
    }

    return new CoordinatesNotFoundError()
  }

  private static isAxiosError(error: unknown): boolean {
    return isAxiosError(error)
  }

  private static isTimeout(error: AxiosError): boolean {
    return TIMEOUT_CODES.includes(error.code ?? '') || error.message.toLowerCase().includes('timeout')
  }

  private static detectProvider(error: AxiosError): string {
    const url = error.config?.url || ''
    const match = PROVIDER_BY_URL_FRAGMENT.find(([fragment]) => url.includes(fragment))

    return match ? match[1] : 'Unknown Provider'
  }

  private static extractCep(url: string): string | undefined {
    const match = url.match(/\b\d{8}\b/) || url.match(/\d{8}/)
    return match ? match[0] : undefined
  }
}
