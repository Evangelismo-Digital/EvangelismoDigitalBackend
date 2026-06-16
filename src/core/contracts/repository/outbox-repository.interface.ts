import { Result } from 'core/shared/result'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { AppError } from 'errors/app-error'

export enum IOutboxEventType {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
}

export interface IOutBoxEventInputData {
  status: IOutboxEventType
  type: string
  payload: FormPayload
}

export interface IOutboxEvent {
  id: number
  publicId: string
  type: string
  status: IOutboxEventType
  payload: unknown
  occurredAt: Date
  sendingAt: Date | undefined
}

export interface IOutboxRepository {
  create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, AppError>>
  findPending(limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findStuck(stuckBefore: Date): Promise<Result<IOutboxEvent[], AppError>>
  findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, AppError>>
  updateStatus(publicId: string, status: IOutboxEventType): Promise<Result<void, AppError>>
  delete(publicId: string): Promise<Result<void, AppError>>
}
