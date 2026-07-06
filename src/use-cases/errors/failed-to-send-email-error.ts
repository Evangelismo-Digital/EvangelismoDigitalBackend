import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { EMAIL_ERRORS } from 'messages/errors/email'

export class FailedToSendEmailError extends DomainError {
  constructor() {
    super(EMAIL_ERRORS.FAILED_TO_SEND, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
