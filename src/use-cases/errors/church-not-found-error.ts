import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class ChurchNotFoundError extends DomainError {
  constructor() {
    super(
      {
        code: 'CHURCH_NOT_FOUND',
        message: messages.errors.churchNotFound,
      },
      ErrorType.NOT_FOUND,
    )
  }
}
