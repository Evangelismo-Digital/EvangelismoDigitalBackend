import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CEP_TO_LAT_LON_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class CepToLatLonError extends DomainError {
  constructor(cep: string) {
    super(
      {
        code: CEP_TO_LAT_LON_ERROR.code,
        message: `${CEP_TO_LAT_LON_ERROR.message} ${cep}.`,
      },
      ErrorType.INTERNAL_SERVER_ERROR,
    )
  }
}
