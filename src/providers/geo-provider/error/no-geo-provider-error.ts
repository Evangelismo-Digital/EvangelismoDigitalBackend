import { InfrastructureError } from '../../../errors/infrastructure-error'
import { NO_GEO_PROVIDER_ERROR } from 'messages/errors/providers/providers-error-messages'

export class NoGeoProviderError extends InfrastructureError {
  constructor() {
    super(NO_GEO_PROVIDER_ERROR)
  }
}
