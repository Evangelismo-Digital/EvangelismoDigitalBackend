import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { AUTH_ERRORS } from 'messages/errors/auth'

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super(AUTH_ERRORS.INVALID_CREDENTIALS, ErrorType.UNAUTHORIZED)
  }
}
