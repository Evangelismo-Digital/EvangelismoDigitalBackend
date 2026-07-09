import {
  FormsRepository,
  IFormSubmission,
  IFormSubmissionInputData,
} from 'core/contracts/repository/forms-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FormsNotFoundError } from '@use-cases/errors/forms/forms-not-found-error'
import { randomUUID } from 'node:crypto'

export class InMemoryFormsSubmissionRepository implements FormsRepository {
  public items: IFormSubmission[] = []

  async create(data: IFormSubmissionInputData): Promise<Result<IFormSubmission, AppError>> {
    const now = new Date()
    const formSubmission: IFormSubmission = {
      id: this.items.length + 1,
      publicId: randomUUID(),
      name: data.name,
      lastName: data.lastName,
      email: data.email,
      decisaoPorCristo: data.decisaoPorCristo,
      location: data.location || null,
      ipAddress: data.ipAddress || null,
      createdAt: now,
      updatedAt: now,
    }

    this.items.push(formSubmission)
    return ok(formSubmission)
  }

  async findByEmail(email: string): Promise<Result<IFormSubmission, AppError>> {
    const submission = this.items.find((item) => item.email === email)

    if (!submission) {
      return err(new FormsNotFoundError())
    }

    return ok(submission)
  }
}
