import { SERVICE_OVERLOAD_ERROR } from 'messages/errors/providers/providers-error-messages'

export class ServiceOverloadError extends Error {
  constructor() {
    super(SERVICE_OVERLOAD_ERROR.message)
  }
}
