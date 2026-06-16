import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { RegisterUserUseCase } from '@use-cases/users/register-user'

export function makeRegisterUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const registerUseCase = new RegisterUserUseCase(usersRepository)

  return registerUseCase
}
