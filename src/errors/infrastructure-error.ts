import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { AppError } from 'errors/app-error'

export abstract class InfrastructureError extends AppError {
  public readonly originalError?: unknown

  constructor(
    detail: IErrorDetail,
    originalError?: unknown,
    type: ErrorType = ErrorType.INTERNAL_SERVER_ERROR,
    failureMode?: FailureMode,
  ) {
    // O tipo aqui e mais para fins de categorizacao interna do erro,
    // embora este tipo nao sera enviado em respostas do Fastify.
    super(detail, type, failureMode)

    this.originalError = originalError

    // Use native Error.cause to preserve the cause chain
    // for logging/Sentry without leaking to error.body (HTTP response)
    if (originalError) {
      this.cause = originalError
    }
  }
}
