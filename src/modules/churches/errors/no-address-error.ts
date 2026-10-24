import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class NoAddressError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_ADDRESS_PROVIDED, ErrorType.BAD_REQUEST)
  }
}
