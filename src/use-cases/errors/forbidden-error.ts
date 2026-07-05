import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { FORBIDDEN_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class ForbiddenError extends DomainError {
  constructor() {
    super(FORBIDDEN_ERROR, ErrorType.FORBIDDEN)
  }
}
