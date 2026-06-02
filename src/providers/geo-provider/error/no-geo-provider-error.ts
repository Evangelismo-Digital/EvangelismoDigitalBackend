import { NO_GEO_PROVIDER_ERROR_MESSAGE } from 'messages/errors/providers/providers-error-messages'

export class NoGeoProviderError extends Error {
  constructor() {
    super(NO_GEO_PROVIDER_ERROR_MESSAGE)
  }
}
