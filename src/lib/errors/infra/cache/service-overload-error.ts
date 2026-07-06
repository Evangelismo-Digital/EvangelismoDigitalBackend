import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export class ServiceOverloadError extends Error {
  constructor() {
    super(INFRA_ERRORS.SERVICE_OVERLOAD.message)
  }
}
