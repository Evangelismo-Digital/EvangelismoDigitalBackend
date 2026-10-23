import { IOutboxEventRegistration } from '@infra/outbox/interfaces/outbox-event.interface'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutboxEventStatus,
} from '@infra/outbox/repositories/outbox-repository.interface'
import { OutboxEventInput } from '@infra/outbox/interfaces/outbox-event-input'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

/**
 * Registro genérico de eventos na Outbox. A montagem do payload é
 * responsabilidade do use case de domínio que chama `register` — a união
 * discriminada OutboxEventInput garante o formato correto por tipo.
 */
export class OutboxEventUseCase implements IOutboxEventRegistration {
  constructor(private readonly outboxRepository: IOutboxRepository) {}

  async register(input: OutboxEventInput): Promise<Result<IOutboxEvent, AppError>> {
    return this.outboxRepository.create({
      status: IOutboxEventStatus.PENDING,
      ...input,
    })
  }
}
