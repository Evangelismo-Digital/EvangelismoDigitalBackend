import { ChurchesRepository } from 'core/contracts/repository/churches-repository.interface'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface FindChurchPublicIdByNameUseCaseRequest {
  name: string
}

interface FindChurchPublicIdByNameUseCaseResponse {
  publicId: string
}

export class FindChurchPublicIdByNameUseCase {
  constructor(private churchesRepository: ChurchesRepository) {}

  async execute({
    name,
  }: FindChurchPublicIdByNameUseCaseRequest): Promise<Result<FindChurchPublicIdByNameUseCaseResponse, AppError>> {
    const result = await this.churchesRepository.findByName(name)
    if (isErr(result)) {
      return result
    }

    const church = result.value
    if (!church) {
      return errOf(new ChurchNotFoundError())
    }

    const publicId = church.publicId

    return ok({ publicId })
  }
}
