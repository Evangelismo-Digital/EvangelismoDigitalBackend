import { NO_ADDRESS_PROVIDER_ERROR_MESSAGE } from 'messages/errors/providers/providers-error-messages'

export class NoAddressProviderError extends Error {
  constructor() {
    super(NO_ADDRESS_PROVIDER_ERROR_MESSAGE)
  }
}
