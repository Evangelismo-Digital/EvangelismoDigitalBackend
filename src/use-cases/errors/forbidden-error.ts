import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { messages } from 'messages/constants/messages'

const FORBIDDEN_ERROR: IErrorDetail = {
  code: 'FORBIDDEN',
  message: messages.errors.forbidden,
}

export class ForbiddenError extends DomainError {
  constructor() {
    super(FORBIDDEN_ERROR, ErrorType.FORBIDDEN)
  }
}
