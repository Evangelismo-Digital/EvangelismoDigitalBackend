import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { LATITUDE_OUT_OF_RANGE_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class LatitudeRangeError extends DomainError {
  constructor() {
    super(LATITUDE_OUT_OF_RANGE_ERROR, ErrorType.BAD_REQUEST)
  }
}
