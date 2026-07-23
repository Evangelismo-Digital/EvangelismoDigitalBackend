import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { FormsNotFoundError } from '@use-cases/errors/forms/forms-not-found-error'
import {
  FormsRepository,
  IFormSubmission,
  IFormSubmissionInputData,
} from 'core/contracts/repository/forms-repository.interface'
import { err, ok, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

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
