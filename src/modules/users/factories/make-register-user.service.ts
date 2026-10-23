import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@modules/users/repositories/errors/users-error-mapping'
import { RegisterUserUseCase } from '@modules/users/services/register-user.service'
import { TransactionalUseCaseDecorator } from '@common/decorators/transactional-use-case.decorator'
import { DatabaseContext } from '@infra/database/prisma/helpers/database-context'

export function makeRegisterUserUseCase() {
  const dbContext = new DatabaseContext()
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper, dbContext)
  const registerUseCase = new RegisterUserUseCase(usersRepository)

  return new TransactionalUseCaseDecorator(registerUseCase, dbContext)
}
