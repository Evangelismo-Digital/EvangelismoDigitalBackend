import { PrismaUsersRepository } from '@repositories/prisma/prisma-users-repository'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { userPrismaErrorMapping } from '@repositories/prisma/errors/users-error-mapping'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { TransactionalUseCaseDecorator } from '@use-cases/decorators/transactional-use-case.decorator'
import { OutboxEventUseCase } from '@use-cases/outbox-event/outbox-event-use-case'
import { ForgotPasswordUseCase } from '@use-cases/users/forgot-password'

export function makeForgotPasswordUseCase() {
  const dbContext = new DatabaseContext()

  const userErrorMapper = new PrismaErrorMapper(userPrismaErrorMapping)
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)

  const usersRepository = new PrismaUsersRepository(userErrorMapper, dbContext)
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

  const eventRegistration = new OutboxEventUseCase(outboxRepository)
  const useCase = new ForgotPasswordUseCase(usersRepository, eventRegistration)

  // Token do usuário + evento da outbox na MESMA transação (padrão do form submission)
  return new TransactionalUseCaseDecorator(useCase, dbContext)
}
