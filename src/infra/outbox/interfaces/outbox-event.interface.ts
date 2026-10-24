import { OutboxEventInput } from '@infra/outbox/interfaces/outbox-event-input'
import { Result } from '@common/utils/result'
import { IOutboxEvent } from '@infra/outbox/repositories/outbox-repository.interface'
import { AppError } from '@common/errors/app-error'

export interface IOutboxEventRegistration {
  register(input: OutboxEventInput): Promise<Result<IOutboxEvent, AppError>>
}
