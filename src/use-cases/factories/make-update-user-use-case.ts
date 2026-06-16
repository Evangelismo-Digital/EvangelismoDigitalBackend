import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { UpdateUserUseCase } from '@use-cases/users/update-user'

export function makeUpdateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const updateUserUseCase = new UpdateUserUseCase(usersRepository)

  return updateUserUseCase
}
