import { IMailJobData } from '@infra/mail/interfaces/mail-job-data.interface'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

export interface IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>>
  buildStaffEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>>
}
