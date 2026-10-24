import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { usersPrismaErrorMapping } from '@modules/users/repositories/errors/users-prisma-error-mapping'
import { AuthenticateUserUseCase } from '@modules/auth/services/authenticate-user.service'
import { makeAuthenticationAuditUseCase } from './make-authentication-audit.service'

export function makeAuthenticateUserUseCase() {
  const usersErrorMapper = new PrismaErrorMapper(usersPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(usersErrorMapper)
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase()
  return new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)
}
