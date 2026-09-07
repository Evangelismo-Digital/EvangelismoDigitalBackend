import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { AuthenticateUserUseCase } from '@use-cases/users/authenticate-user'
import { makeAuthenticationAuditUseCase } from './make-authentication-audit-use-case'

export function makeAuthenticateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase()
  return new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)
}
