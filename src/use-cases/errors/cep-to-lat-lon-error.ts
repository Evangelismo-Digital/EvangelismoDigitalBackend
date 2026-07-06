import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class CepToLatLonError extends DomainError {
  constructor(cep: string) {
    super(
      {
        code: CHURCH_ERRORS.CEP_TO_LAT_LON_FAILED.code,
        message: `${CHURCH_ERRORS.CEP_TO_LAT_LON_FAILED.message} ${cep}.`,
      },
      ErrorType.INTERNAL_SERVER_ERROR,
    )
  }
}
