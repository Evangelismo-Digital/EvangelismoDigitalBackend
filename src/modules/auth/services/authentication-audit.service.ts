import { logger } from '@infra/logger'
import { captureError } from '@infra/sentry/capture'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from '@modules/auth/repositories/authentication-audit-repository.interface'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

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
