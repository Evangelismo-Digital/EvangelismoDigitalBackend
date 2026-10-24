import { InfrastructureError } from '@common/errors/infrastructure-error'
import { GEO_ERRORS } from '@common/messages/errors/geolocation'

export class NoGeoProviderError extends InfrastructureError {
  constructor() {
    super(GEO_ERRORS.NO_PROVIDER)
  }
}
