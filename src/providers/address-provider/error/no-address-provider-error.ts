import { InfrastructureError } from '../../../errors/infrastructure-error'
import { NO_ADDRESS_PROVIDER_ERROR } from 'messages/errors/providers/providers-error-messages'

export class NoAddressProviderError extends InfrastructureError {
  constructor() {
    super(NO_ADDRESS_PROVIDER_ERROR)
  }
}
