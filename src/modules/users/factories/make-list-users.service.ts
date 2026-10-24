import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { usersPrismaErrorMapping } from '@modules/users/repositories/errors/users-prisma-error-mapping'
import { ListUsersUseCase } from '@modules/users/services/list-users.service'

export function makeListUsersUseCase() {
  const usersErrorMapper = new PrismaErrorMapper(usersPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(usersErrorMapper)
  return new ListUsersUseCase(usersRepository)
}
