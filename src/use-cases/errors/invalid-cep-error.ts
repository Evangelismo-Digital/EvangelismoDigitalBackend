import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class InvalidCepError extends DomainError {
  constructor() {
    super(
      {
        code: 'INVALID_CEP',
        message: messages.errors.cepDoesNotExist,
      },
      ErrorType.NOT_FOUND,
    )
  }
}
