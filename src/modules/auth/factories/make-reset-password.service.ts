import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { usersPrismaErrorMapping } from '@modules/users/repositories/errors/users-prisma-error-mapping'
import { ResetPasswordUseCase } from '@modules/auth/services/reset-password.service'

export function makeResetPasswordUseCase() {
  const usersErrorMapper = new PrismaErrorMapper(usersPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(usersErrorMapper)
  return new ResetPasswordUseCase(usersRepository)
}
