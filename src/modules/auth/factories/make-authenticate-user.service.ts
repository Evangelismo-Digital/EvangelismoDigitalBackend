import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@modules/users/repositories/errors/users-error-mapping'
import { AuthenticateUserUseCase } from '@modules/auth/services/authenticate-user.service'
import { makeAuthenticationAuditUseCase } from './make-authentication-audit.service'

export function makeAuthenticateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase()
  return new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)
}
