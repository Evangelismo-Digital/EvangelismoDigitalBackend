// Abstract class for future domain errors implementations.

import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { AppError } from './app-error'
import { ErrorType } from 'core/types/error-type/error-type'

export abstract class DomainError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail: IErrorDetail, type: ErrorType, failureMode?: FailureMode) {
    super(detail, type, failureMode)
  }
}
