import { InfrastructureError } from '../../../errors/infrastructure-error'
import { ADDRESS_PROVIDER_FAILURE_ERROR } from 'messages/errors/providers/providers-error-messages'

export class AddressProviderFailureError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(ADDRESS_PROVIDER_FAILURE_ERROR, reason)
  }
}
