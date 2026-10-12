import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { ANALYTICS_ERRORS } from 'messages/errors/analytics'

export class VisitorNotFoundError extends DomainError {
  constructor() {
    super(ANALYTICS_ERRORS.VISITOR_NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
