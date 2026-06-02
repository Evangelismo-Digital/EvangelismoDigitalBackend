import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class LongitudeRangeError extends DomainError {
  constructor() {
    super(
      {
        code: 'LONGITUDE_OUT_OF_RANGE',
        message: messages.longitude.outOfRange,
      },
      ErrorType.BAD_REQUEST,
    )
  }
}
