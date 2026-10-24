import { PrismaUsersRepository } from '@modules/users/repositories/prisma-users.repository'
import { PrismaOutboxRepository } from '@infra/outbox/repositories/prisma-outbox-event.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { usersPrismaErrorMapping } from '@modules/users/repositories/errors/users-prisma-error-mapping'
import {
  outboxDomainPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@infra/outbox/repositories/errors/outbox-prisma-error-mapping'
import { DatabaseContext } from '@infra/database/prisma/helpers/database-context'
import { TransactionalUseCaseDecorator } from '@common/decorators/transactional-use-case.decorator'
import { OutboxEventUseCase } from '@infra/outbox/services/outbox-event.service'
import { ForgotPasswordUseCase } from '@modules/auth/services/forgot-password.service'

export function makeForgotPasswordUseCase() {
  const dbContext = new DatabaseContext()

  const usersErrorMapper = new PrismaErrorMapper(usersPrismaErrorMapping)
  const outboxDomainErrorMapper = new PrismaErrorMapper(outboxDomainPrismaErrorMapping)
  const outboxInfraErrorMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)

  const usersRepository = new PrismaUsersRepository(usersErrorMapper, dbContext)
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxDomainErrorMapper, outboxInfraErrorMapper)

  const eventRegistration = new OutboxEventUseCase(outboxRepository)
  const useCase = new ForgotPasswordUseCase(usersRepository, eventRegistration)

  // Token do usuário + evento da outbox na MESMA transação (padrão do form submission)
  return new TransactionalUseCaseDecorator(useCase, dbContext)
}
