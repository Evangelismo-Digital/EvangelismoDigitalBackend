import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { ZOD_VALIDATION_ERROR } from 'messages/errors/system/validation'

export class ZodValidationError extends DomainError {
  constructor(zodIssues: Record<string, unknown>) {
    super(
      {
        code: ZOD_VALIDATION_ERROR.code,
        message: ZOD_VALIDATION_ERROR.message,
        issues: zodIssues,
      },
      ErrorType.BAD_REQUEST,
    )
  }
}
