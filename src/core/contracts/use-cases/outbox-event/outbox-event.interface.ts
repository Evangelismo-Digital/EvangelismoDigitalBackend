import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { Result } from 'core/shared/result'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { AppError } from 'errors/app-error'

export interface IOutboxEventRegistration {
  register(form: FormPayload): Promise<Result<IOutboxEvent, AppError>>
}
