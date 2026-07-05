import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { FORM_SUBMISSION_ERROR } from 'messages/errors/use-cases/forms/forms-error-messages'

export class FormSubmissionError extends DomainError {
  constructor() {
    super(FORM_SUBMISSION_ERROR, ErrorType.BAD_REQUEST)
  }
}
