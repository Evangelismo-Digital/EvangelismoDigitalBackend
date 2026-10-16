import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { INVALID_PASSWORD_RESET_PAYLOAD_ERROR_FN } from 'messages/errors/password-reset'

export class InvalidPasswordResetPayloadError extends DomainError {
  constructor(fieldName?: string) {
    super(INVALID_PASSWORD_RESET_PAYLOAD_ERROR_FN(fieldName), ErrorType.BAD_REQUEST)
  }
}
