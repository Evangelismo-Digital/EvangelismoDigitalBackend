import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@modules/users/repositories/errors/users-error-mapping'
import { DeleteUserUseCase } from '@modules/users/services/delete-user.service'

export function makeDeleteUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  return new DeleteUserUseCase(usersRepository)
}
