import { AppError } from './app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { ServiceBusyError } from './infrastructure/service-busy-error'
import { ServiceOverloadError as InfraServiceOverloadError } from './infrastructure/service-overload-error'
import { TimeoutExceededError } from './infrastructure/timeout-exceeded-error'
import { ProviderFailureError, ProviderLayer } from './infrastructure/provider-failure-error'

export const AppErrorRegistry: Record<string, (message: string, data?: any) => AppError> = {
  InvalidCepError: (msg) => {
    const cep = msg.match(/\b\d{8}\b/)?.[0] || msg.match(/\d{8}/)?.[0]
    return new InvalidCepError(cep)
  },

  CoordinatesNotFoundError: () => new CoordinatesNotFoundError(),

  NoNearbyChurchesFoundError: () => new NoNearbyChurchesFoundError(),

  CepToLatLonError: (msg) => {
    const cep = msg.match(/\d+/)?.[0] || ''
    return new CepToLatLonError(cep)
  },

  ServiceBusyError: (msg, data) => {
    const provider = data?.body?.provider || msg.replace('Serviço temporariamente indisponível: ', '')
    return new ServiceBusyError(provider)
  },

  ServiceOverloadError: () => new InfraServiceOverloadError(),

  TimeoutExceededError: (msg) => new TimeoutExceededError(msg),

  ProviderFailureError: (msg, data) => {
    const provider = data?.body?.providerContext?.provider || data?.providerContext?.provider || 'Unknown'
    const layer = data?.body?.providerContext?.layer || data?.providerContext?.layer || ProviderLayer.Address
    return new ProviderFailureError(provider, layer, data?.originalError)
  },
}

export function deserializeAppError(type: string, message: string, data?: any): AppError | null {
  const factory = AppErrorRegistry[type]
  if (factory) {
    try {
      return factory(message, data)
    } catch {
      return null
    }
  }
  return null
}
