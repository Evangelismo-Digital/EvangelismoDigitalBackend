import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { AUTH_ERRORS } from '@common/messages/errors/auth'

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super(AUTH_ERRORS.INVALID_CREDENTIALS, ErrorType.UNAUTHORIZED)
  }
}
