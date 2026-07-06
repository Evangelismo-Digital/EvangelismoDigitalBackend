import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { USER_ERRORS } from 'messages/errors/users'

export class UserNotCreatedError extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_CREATED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
