import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>>
  buildStaffEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>>
}
