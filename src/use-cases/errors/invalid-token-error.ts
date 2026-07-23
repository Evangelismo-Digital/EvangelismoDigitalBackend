import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { AUTH_ERRORS } from 'messages/errors/auth'

export class InvalidTokenError extends DomainError {
  constructor() {
    super(AUTH_ERRORS.INVALID_TOKEN, ErrorType.UNAUTHORIZED)
  }
}
