import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class LatitudeRangeError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LATITUDE_OUT_OF_RANGE, ErrorType.BAD_REQUEST)
  }
}
