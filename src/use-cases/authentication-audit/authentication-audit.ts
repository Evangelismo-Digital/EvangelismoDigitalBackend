import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from 'core/contracts/repository/authentication-audit-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export class AuthenticationAuditUseCase {
  constructor(private readonly authenticationAuditRepository: AuthenticationAuditRepository) {}

  async execute(data: AuthenticationAuditInput): Promise<Result<void, AppError>> {
    const result = await this.authenticationAuditRepository.create(data)

    if (isErr(result)) {
      logger.error({ error: result.error }, 'Falha ao criar registro de auditoria de autenticação')
      captureError(result.error, { status: data.status })
      return result
    }

    return ok(undefined)
  }
}
