import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class ChurchAlreadyExistsError extends DomainError {
  constructor() {
    super(
      {
        code: 'CHURCH_ALREADY_EXISTS',
        message: messages.validation.churchAlreadyExists,
      },
      ErrorType.CONFLICT,
    )
  }
}
