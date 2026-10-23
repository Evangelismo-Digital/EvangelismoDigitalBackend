import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@modules/users/repositories/errors/users-error-mapping'
import { UpdateUserUseCase } from '@modules/users/services/update-user.service'

export function makeUpdateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper)
  return new UpdateUserUseCase(usersRepository)
}
