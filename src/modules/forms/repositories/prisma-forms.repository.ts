import { DatabaseContext } from '@infra/database/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { FormsNotFoundError } from '@modules/forms/errors/forms-not-found-error'
import {
  FormsRepository,
  IFormSubmission,
  IFormSubmissionInputData,
} from '@modules/forms/repositories/forms-repository.interface'
import { err, ok, Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

export class PrismaFormsRepository implements FormsRepository {
  constructor(
    private readonly dbContext: DatabaseContext,
    private readonly errorMapper: PrismaErrorMapper<AppError>,
  ) {}

  async create(data: IFormSubmissionInputData): Promise<Result<IFormSubmission, AppError>> {
    try {
      const formSubmission = await this.dbContext.client.formSubmission.create({
        data,
      })

      return ok(formSubmission)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async findByEmail(email: string): Promise<Result<IFormSubmission, AppError>> {
    try {
      const formSubmission = await this.dbContext.client.formSubmission.findFirst({
        where: {
          email,
        },
      })

      if (!formSubmission) {
        return err(new FormsNotFoundError())
      }

      return ok(formSubmission)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }
}
