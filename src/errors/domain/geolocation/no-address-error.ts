import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class NoAddressError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_ADDRESS_PROVIDED, ErrorType.BAD_REQUEST)
  }
}
