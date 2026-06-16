import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { USER_NOT_CREATED_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class UserNotCreatedError extends DomainError {
  constructor() {
    super(USER_NOT_CREATED_ERROR, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
