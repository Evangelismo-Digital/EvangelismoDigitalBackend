import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class CreateChurchError extends DomainError {
  constructor() {
    super(
      {
        code: 'CREATE_CHURCH_FAILED',
        message: messages.errors.createChurchFailed,
      },
      ErrorType.INTERNAL_SERVER_ERROR,
    )
  }
}
