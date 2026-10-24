import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { usersPrismaErrorMapping } from '@modules/users/repositories/errors/users-prisma-error-mapping'
import { SearchUsersUseCase } from '@modules/users/services/search-users.service'

export function makeSearchUsersUseCase() {
  const usersErrorMapper = new PrismaErrorMapper(usersPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(usersErrorMapper)
  return new SearchUsersUseCase(usersRepository)
}
