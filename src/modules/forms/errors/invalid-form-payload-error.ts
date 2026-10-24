import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { INVALID_FORM_PAYLOAD_ERROR_FN } from '@common/messages/errors/forms'

export class InvalidFormPayloadError extends DomainError {
  constructor(fieldName?: string) {
    super(INVALID_FORM_PAYLOAD_ERROR_FN(fieldName), ErrorType.BAD_REQUEST)
  }
}
