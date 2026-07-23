import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class LongitudeRangeError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LONGITUDE_OUT_OF_RANGE, ErrorType.BAD_REQUEST)
  }
}
