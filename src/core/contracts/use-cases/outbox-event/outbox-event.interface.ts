import { OutboxEventInput } from 'core/types/outbox/outbox-event-input'
import { Result } from 'core/shared/result'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { AppError } from 'errors/app-error'

export interface IOutboxEventRegistration {
  register(input: OutboxEventInput): Promise<Result<IOutboxEvent, AppError>>
}
