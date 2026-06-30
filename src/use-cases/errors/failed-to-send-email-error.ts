import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { FAILED_TO_SEND_EMAIL_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class FailedToSendEmailError extends DomainError {
  constructor() {
    super(FAILED_TO_SEND_EMAIL_ERROR, ErrorType.BAD_REQUEST)
  }
}
