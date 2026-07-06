import { InfrastructureError } from '../../../errors/infrastructure-error'
import { GEO_ERRORS } from 'messages/errors/geolocation'

export class AddressProviderFailureError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(GEO_ERRORS.ADDRESS_PROVIDER_FAILURE, reason)
  }
}
