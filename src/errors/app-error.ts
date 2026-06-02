import { IAppError } from 'core/contracts/errors/app-error.interface'
import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorType } from 'core/types/error-type/error-type'

export abstract class AppError extends Error implements IAppError {
  public type: ErrorType
  public body: IErrorDetail

  /**
   * @param detail – the error descriptor (code + message + optional extras)
   * @param type – the error type
   */
  protected constructor(detail: IErrorDetail, type: ErrorType) {
    super(detail.message)

    this.name = this.constructor.name
    this.type = type

    this.body = {
      code: detail.code,
      message: detail.message,
      ...(detail.issues && { issues: detail.issues }),
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    Object.setPrototypeOf(this, new.target.prototype)
  }
}
