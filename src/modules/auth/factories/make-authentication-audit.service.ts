import { PrismaAuthenticationAuditRepository } from '@modules/auth/repositories/prisma-authentication-audit.repository'
import { AuthenticationAuditUseCase } from '@modules/auth/services/authentication-audit.service'

export function makeAuthenticationAuditUseCase() {
  const authenticationAuditRepository = new PrismaAuthenticationAuditRepository()

  return new AuthenticationAuditUseCase(authenticationAuditRepository)
}
