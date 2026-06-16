import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { ListUsersUseCase } from '@use-cases/users/list-users'

export function makeListUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  const listUsersUseCase = new ListUsersUseCase(usersRepository)

  return listUsersUseCase
}
