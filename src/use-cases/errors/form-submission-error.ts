import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { messages } from 'messages/constants/messages'

const FORM_SUBMISSION_FAILED_ERROR: IErrorDetail = {
  code: 'FORM_SUBMISSION_FAILED',
  message: messages.errors.formSubmissionFailed,
}

export class FormSubmissionError extends DomainError {
  constructor() {
    super(FORM_SUBMISSION_FAILED_ERROR, ErrorType.BAD_REQUEST)
  }
}
