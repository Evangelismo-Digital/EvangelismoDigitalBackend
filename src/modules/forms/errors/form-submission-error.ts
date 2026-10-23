import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { FORM_ERRORS } from '@common/messages/errors/forms'

export class FormSubmissionError extends DomainError {
  constructor() {
    super(FORM_ERRORS.SUBMISSION, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
