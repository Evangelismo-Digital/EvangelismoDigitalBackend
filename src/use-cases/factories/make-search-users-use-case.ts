import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { SearchUsersUseCase } from '@use-cases/users/search-users-use-case'

export function makeSearchUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  return new SearchUsersUseCase(usersRepository)
}
