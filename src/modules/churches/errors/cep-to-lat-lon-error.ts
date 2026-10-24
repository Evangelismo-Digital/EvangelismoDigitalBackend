import { ErrorType } from '@common/types/error-type/error-type'
import { SystemError } from '@common/errors/system-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class CepToLatLonError extends SystemError {
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
