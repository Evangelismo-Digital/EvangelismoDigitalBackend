import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { formsErrorMapping } from '@use-cases/errors/forms/forms-error-mapper'
import { FormsNotFoundError } from '@use-cases/errors/forms/forms-not-found-error'
import {
  FormsRepository,
  IFormSubmission,
  IFormSubmissionInputData,
} from 'core/contracts/repository/forms-repository.interface'
import { err, ok, Result } from 'core/shared/result'

export class PrismaFormsRepository implements FormsRepository {
  private httpErrorMapper = new PrismaErrorMapper(formsErrorMapping)

  constructor(private readonly dbContext: DatabaseContext) {}

  async create(data: IFormSubmissionInputData): Promise<Result<IFormSubmission, Error>> {
    try {
      const formSubmission = await this.dbContext.client.formSubmission.create({
        data,
      })

      return ok(formSubmission)
    } catch (error) {
      const mappedError = this.httpErrorMapper.mapToKnownError(error)
      return err(mappedError)
    }
  }

  async findByEmail(email: string): Promise<Result<IFormSubmission, Error>> {
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
      const mappedError = this.httpErrorMapper.mapToKnownError(error)
      return err(mappedError)
    }
  }
}
