import { IOutboxEvent } from '@infra/outbox/repositories/outbox-repository.interface'

export interface IOutboxEventJobData {
  readonly publicId: string
  readonly event: IOutboxEvent
}
