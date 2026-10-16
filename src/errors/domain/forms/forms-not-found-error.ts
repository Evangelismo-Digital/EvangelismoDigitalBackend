import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { FORM_ERRORS } from 'messages/errors/forms'

export class FormsNotFoundError extends DomainError {
  constructor() {
    super(FORM_ERRORS.NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
