import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { ANALYTICS_ERRORS } from '@common/messages/errors/analytics'

export class VisitorNotFoundError extends DomainError {
  constructor() {
    super(ANALYTICS_ERRORS.VISITOR_NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
