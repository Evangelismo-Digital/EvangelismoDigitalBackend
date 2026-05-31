import { PrismaAuthenticationAuditRepository } from '@repositories/prisma/prisma-authentication-audit-repository'
import { AuthenticationAuditUseCase } from '@use-cases/authentication-audit/authentication-audit'

export function makeAuthenticationAuditUseCase() {
  const authenticationAuditRepository = new PrismaAuthenticationAuditRepository()

  return new AuthenticationAuditUseCase(authenticationAuditRepository)
}