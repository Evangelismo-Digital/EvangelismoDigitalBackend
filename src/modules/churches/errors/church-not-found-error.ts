import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class ChurchNotFoundError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
