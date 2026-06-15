import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { InfrastructureError } from '../infrastructure-error'
import { PROVIDER_FAILURE_ERROR } from 'messages/errors/providers/providers-error-messages'

export enum ProviderLayer {
  Address = 'AddressProvider',
  Geo = 'GeoProvider',
  Route = 'ChurchRouteProvider',
}

export class ProviderFailureError extends InfrastructureError {
  constructor(provider: string, layer: ProviderLayer, originalError?: unknown) {
    super(
      {
        code: PROVIDER_FAILURE_ERROR.code,
        message: PROVIDER_FAILURE_ERROR.message,
        providerContext: { provider, layer },
      },
      originalError,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.RETRYABLE,
    )
    this.name = 'ProviderFailureError'
  }
}

