import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { FORBIDDEN_ERROR } from 'messages/constants/errors/http'

export class ForbiddenError extends DomainError {
  constructor() {
    super(FORBIDDEN_ERROR, ErrorType.FORBIDDEN)
  }
}
