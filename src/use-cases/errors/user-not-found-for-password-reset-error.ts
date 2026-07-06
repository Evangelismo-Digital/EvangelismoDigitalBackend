import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { USER_ERRORS } from 'messages/errors/users'

export class UserNotFoundForPasswordResetError extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_FOUND_FOR_PASSWORD_RESET, ErrorType.NOT_FOUND)
  }
}
