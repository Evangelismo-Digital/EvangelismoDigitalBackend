import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import { RegisterUserUseCase } from '@use-cases/users/register-user'
import { TransactionalUseCaseDecorator } from '@use-cases/decorators/transactional-use-case.decorator'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'

export function makeRegisterUserUseCase() {
  const dbContext = new DatabaseContext()
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const usersRepository = new PrismaUsersRepository(errorMapper, dbContext)
  const registerUseCase = new RegisterUserUseCase(usersRepository)

  return new TransactionalUseCaseDecorator(registerUseCase, dbContext)
}
