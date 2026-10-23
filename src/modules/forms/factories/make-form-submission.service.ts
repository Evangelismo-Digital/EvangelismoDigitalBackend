import { OutboxEventUseCase } from '@infra/outbox/services/outbox-event.service'
import { DatabaseContext } from '@infra/database/prisma/helpers/database-context'
import { PrismaFormsRepository } from '@modules/forms/repositories/prisma-forms.repository'
import { PrismaOutboxRepository } from '@infra/outbox/repositories/prisma-outbox-event.repository'
import { TransactionalUseCaseDecorator } from '@common/decorators/transactional-use-case.decorator'
import { FormsSubmissionUseCase } from '@modules/forms/services/forms-submission.service'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { formsPrismaErrorMapping } from '@modules/forms/repositories/errors/forms-error-mapping'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@infra/outbox/repositories/errors/outbox-error-mapping'

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
