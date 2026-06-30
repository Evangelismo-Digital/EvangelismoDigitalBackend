import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { INVALID_FORM_PAYLOAD_ERROR } from 'messages/errors/use-cases/forms/invalid-form-payload-error-message'

export class InvalidFormPayloadError extends DomainError {
  constructor(fieldName?: string) {
    super(INVALID_FORM_PAYLOAD_ERROR(fieldName), ErrorType.BAD_REQUEST)
  }
}
