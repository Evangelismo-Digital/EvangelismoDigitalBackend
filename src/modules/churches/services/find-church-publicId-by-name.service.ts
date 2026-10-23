import { ChurchesRepository } from '@modules/churches/repositories/churches-repository.interface'
import { ChurchNotFoundError } from '@modules/churches/errors/church-not-found-error'
import { Result, ok, err, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

interface FindChurchPublicIdByNameUseCaseRequest {
  name: string
}

interface FindChurchPublicIdByNameUseCaseResponse {
  publicId: string
}

export class FindChurchPublicIdByNameUseCase {
  constructor(private readonly churchesRepository: ChurchesRepository) {}

  async execute({
    name,
  }: FindChurchPublicIdByNameUseCaseRequest): Promise<Result<FindChurchPublicIdByNameUseCaseResponse, AppError>> {
    const result = await this.churchesRepository.findByName(name)
    if (isErr(result)) {
      return result
    }

    const church = result.value
    if (!church) {
      return err(new ChurchNotFoundError())
    }

    const publicId = church.publicId

    return ok({ publicId })
  }
}
