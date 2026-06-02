import { logger } from '@lib/logger'
import {
  AuthenticationAuditInput,
  AuthenticationAuditRepository,
} from 'core/contracts/repository/authentication-audit-repository.interface'

export class AuthenticationAuditUseCase {
  constructor(private readonly authenticationAuditRepository: AuthenticationAuditRepository) {}

  async execute(data: AuthenticationAuditInput): Promise<void> {
    try {
      await this.authenticationAuditRepository.create(data)
    } catch (error) {
      logger.error(error, 'Falha ao criar registro de auditoria de autenticação')
    }
  }
}
