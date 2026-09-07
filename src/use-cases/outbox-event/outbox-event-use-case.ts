import { IOutboxEventRegistration } from 'core/contracts/use-cases/outbox-event/outbox-event.interface'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutboxEventStatus,
} from 'core/contracts/repository/outbox-repository.interface'
import { OutboxEventInput } from 'core/types/outbox/outbox-event-input'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

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
