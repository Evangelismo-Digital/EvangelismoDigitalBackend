import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export enum ProviderLayer {
  Address = 'AddressProvider',
  Geo = 'GeoProvider',
  Route = 'ChurchRouteProvider',
}

export class ProviderFailureError extends InfrastructureError {
  constructor(provider: string, layer: ProviderLayer, originalError?: unknown) {
    super(
      {
        code: INFRA_ERRORS.PROVIDER_FAILURE.code,
        message: INFRA_ERRORS.PROVIDER_FAILURE.message,
        providerContext: { provider, layer },
      },
      originalError,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.RETRYABLE,
    )
    this.name = 'ProviderFailureError'
  }
}
