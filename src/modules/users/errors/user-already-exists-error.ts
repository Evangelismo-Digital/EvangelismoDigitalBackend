import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { USER_ERRORS } from '@common/messages/errors/users'

export class UserAlreadyExistsError extends DomainError {
  constructor() {
    super(USER_ERRORS.ALREADY_EXISTS, ErrorType.CONFLICT)
  }
}
