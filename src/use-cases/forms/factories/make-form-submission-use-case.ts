import { OutboxEventUseCase } from '@use-cases/outbox-event/outbox-event-use-case'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaFormsRepository } from '@repositories/prisma/prisma-forms-repository'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { TransactionalUseCaseDecorator } from '@use-cases/decorators/transactional-use-case.decorator'
import { FormsSubmissionUseCase } from '@use-cases/forms/forms-submission'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { formsPrismaErrorMapping } from '@repositories/prisma/errors/forms-error-mapping'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'

export function makeFormSubmissionUseCase() {
  // 1. Contexto de Banco de Dados (Gerenciador de Transação)
  const dbContext = new DatabaseContext()

  // 2. Mappers de erro
  const formsErrorMapper = new PrismaErrorMapper(formsPrismaErrorMapping)
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)

  // 3. Repositórios (Injetamos o dbContext e os mappers)
  const formsRepository = new PrismaFormsRepository(dbContext, formsErrorMapper)
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

  // 4. Infraestrutura (Publisher usa o repositório de outbox)
  const notificationPublisher = new OutboxEventUseCase(outboxRepository)

  // 5. Use Case Puro (Regra de Negócio)
  const useCase = new FormsSubmissionUseCase(formsRepository, notificationPublisher)

  // 6. Decoração (Envolve o Use Case na Transação)
  return new TransactionalUseCaseDecorator(useCase, dbContext)
}
