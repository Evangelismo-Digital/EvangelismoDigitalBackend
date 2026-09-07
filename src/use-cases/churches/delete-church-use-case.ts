import { Church, ChurchesRepository } from 'core/contracts/repository/churches-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface DeleteChurchUseCaseRequest {
  publicId: string
}

interface DeleteChurchUseCaseResponse {
  church: Church
}

export class DeleteChurchUseCase {
  constructor(private readonly churchesRepository: ChurchesRepository) {}

  async execute({ publicId }: DeleteChurchUseCaseRequest): Promise<Result<DeleteChurchUseCaseResponse, AppError>> {
    const result = await this.churchesRepository.deleteChurchByPublicId(publicId)
    if (isErr(result)) {
      return result
    }

    return ok({ church: result.value })
  }
}
