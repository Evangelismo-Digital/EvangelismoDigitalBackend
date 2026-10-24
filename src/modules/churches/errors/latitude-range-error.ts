import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class LatitudeRangeError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LATITUDE_OUT_OF_RANGE, ErrorType.BAD_REQUEST)
  }
}
