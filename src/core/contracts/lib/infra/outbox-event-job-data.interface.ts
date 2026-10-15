import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'

export interface IOutboxEventJobData {
  readonly publicId: string
  readonly event: IOutboxEvent
}
