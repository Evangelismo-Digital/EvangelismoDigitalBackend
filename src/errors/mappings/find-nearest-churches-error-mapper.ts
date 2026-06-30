import { Result, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { AxiosError, isAxiosError } from 'axios'
import { Prisma } from '@prisma/client'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'

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
      const axiosError = error as AxiosError
      const status = axiosError.response?.status
      const code = axiosError.code

      if (status === 429) {
        return new ServiceBusyError(FindNearestChurchesErrorMapper.detectProvider(axiosError))
      }

      if (code === 'ERR_CANCELED' || code === 'ECONNABORTED' || axiosError.message.toLowerCase().includes('timeout')) {
        return new TimeoutExceededError(axiosError.message)
      }

      if (status === 404) {
        const url = axiosError.config?.url || ''
        if (url.includes('viacep') || url.includes('awesomeapi') || url.includes('brasilapi')) {
          const cep = FindNearestChurchesErrorMapper.extractCep(url)
          return new InvalidCepError(cep)
        }
        return new CoordinatesNotFoundError()
      }

      return new ProviderFailureError(
        FindNearestChurchesErrorMapper.detectProvider(axiosError),
        FindNearestChurchesErrorMapper.detectLayer(axiosError),
        error,
      )
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return new DatabaseQueryError(error)
    }

    return new ProviderFailureError(
      'System',
      ProviderLayer.Address,
      error instanceof Error ? error : new Error(String(error)),
    )
  }

  private static isAxiosError(error: unknown): boolean {
    return isAxiosError(error)
  }

  private static detectProvider(error: AxiosError): string {
    const url = error.config?.url || ''
    if (url.includes('viacep')) return 'ViaCEP'
    if (url.includes('awesomeapi')) return 'AwesomeAPI'
    if (url.includes('brasilapi')) return 'BrasilAPI'
    if (url.includes('nominatim')) return 'Nominatim'
    if (url.includes('locationiq')) return 'LocationIQ'
    if (url.includes('stadia')) return 'Stadia Maps'
    return 'Unknown Provider'
  }

  private static detectLayer(error: AxiosError): ProviderLayer {
    const url = error.config?.url || ''
    if (url.includes('viacep') || url.includes('awesomeapi') || url.includes('brasilapi')) {
      return ProviderLayer.Address
    }
    if (url.includes('nominatim') || url.includes('locationiq')) {
      return ProviderLayer.Geo
    }
    return ProviderLayer.Route
  }

  private static extractCep(url: string): string | undefined {
    const match = url.match(/\b\d{8}\b/) || url.match(/\d{8}/)
    return match ? match[0] : undefined
  }
}
