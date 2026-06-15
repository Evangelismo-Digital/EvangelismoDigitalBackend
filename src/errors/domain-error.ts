// Abstract class for future domain errors implementations.

import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorCategory } from 'core/types/error-category/error-category.enum'
import { AppError } from './app-error'
import { ErrorType } from 'core/types/error-type/error-type'

export abstract class DomainError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail: IErrorDetail, type: ErrorType, category?: ErrorCategory) {
    super(detail, type, category)
  }
}
