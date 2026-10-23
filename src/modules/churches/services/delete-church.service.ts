import { Church, ChurchesRepository } from '@modules/churches/repositories/churches-repository.interface'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

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
