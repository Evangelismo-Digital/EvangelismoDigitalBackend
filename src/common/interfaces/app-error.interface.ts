import { ErrorType } from '@common/types/error-type/error-type'
import { IErrorDetail } from './error-detail.interface'

export interface IAppError extends Error {
  readonly type: ErrorType

  readonly body: IErrorDetail
}
