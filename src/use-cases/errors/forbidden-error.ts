import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { AUTH_ERRORS } from 'messages/errors/auth'

export class ForbiddenError extends DomainError {
  constructor() {
    super(AUTH_ERRORS.FORBIDDEN, ErrorType.FORBIDDEN)
  }
}
