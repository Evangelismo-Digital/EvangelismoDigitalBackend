import { InfrastructureError } from '../../../errors/infrastructure-error'
import { GEO_ERRORS } from 'messages/errors/geolocation'

export class NoAddressProviderError extends InfrastructureError {
  constructor() {
    super(GEO_ERRORS.NO_ADDRESS_PROVIDER)
  }
}
