import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@modules/users/repositories/errors/users-error-mapping'
import { ResetPasswordUseCase } from '@modules/auth/services/reset-password.service'

export function makeResetPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  return new ResetPasswordUseCase(usersRepository)
}
