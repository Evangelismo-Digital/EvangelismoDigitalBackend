import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { DomainError } from 'errors/domain-error'
import { INVALID_CEP_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class InvalidCepError extends DomainError {
  constructor(cep?: string) {
    const detail = {
      code: INVALID_CEP_ERROR.code,
      message: cep ? `O CEP fornecido ${cep} não existe.` : INVALID_CEP_ERROR.message,
    }
    super(detail, ErrorType.NOT_FOUND, FailureMode.NOT_FOUND)
  }
}
