import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorType } from 'core/types/error-type/error-type'
import { AppError } from 'errors/app-error'

export abstract class InfrastructureError extends AppError {
  public readonly originalError?: unknown

  constructor(detail: IErrorDetail, originalError?: unknown, type: ErrorType = ErrorType.INTERNAL_SERVER_ERROR) {
    // O tipo aqui e mais para fins de categorizacao interna do erro,
    // embora este tipo nao sera enviado em respostas do Fastify.
    super(detail, type)

    this.originalError = originalError

    //Seus loggers globais capturem a stack trace nativamente.
    if (originalError) {
      this.body.originalError =
        originalError instanceof Error ? originalError.stack || originalError.message : originalError
    }
  }
}
