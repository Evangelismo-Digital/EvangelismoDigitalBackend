import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { FORM_ERRORS } from '@common/messages/errors/forms'

export class FormsAlreadyExistsError extends DomainError {
  constructor() {
    super(FORM_ERRORS.ALREADY_EXISTS, ErrorType.CONFLICT)
  }
}
