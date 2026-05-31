import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { AuthenticateUserUseCase } from '@use-cases/users/authenticate-user'
import { makeAuthenticationAuditUseCase } from './make-authentication-audit-use-case'

export function makeAuthenticateUserUseCase() {
  const usersRepository = new PrismaUsersRepository()
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase()
  const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

  return authenticateUserUseCase
}
