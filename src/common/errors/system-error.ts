import { ErrorType } from '@common/types/error-type/error-type'
import { AppError } from './app-error'
import { IErrorDetail } from '@common/interfaces/error-detail.interface'

// Abstract class for system errors implementations.
export abstract class SystemError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail: IErrorDetail, type: ErrorType) {
    super(detail, type)
  }
}
