import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class CepToLatLonError extends DomainError {
  constructor() {
    super(
      {
        code: 'CEP_TO_LAT_LON_FAILED',
        message: messages.errors.cepToLatLonError,
      },
      ErrorType.INTERNAL_SERVER_ERROR,
    )
  }
}
