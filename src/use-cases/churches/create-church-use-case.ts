import { ChurchesRepository } from 'core/contracts/repository/churches-repository.interface'
import { ChurchAlreadyExistsError } from '@use-cases/errors/church-already-exists-error'
import { NoAddressError } from '@use-cases/errors/no-address-error'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface CreateChurchUseCaseRequest {
  name: string
  address: string
  lat: number
  lon: number
}

interface CreateChurchUseCaseResponse {
  id: number
  publicId: string
  name: string
  address: string
  lat: number
  lon: number
  geog?: unknown
  createdAt: Date
  updatedAt: Date
}

export class CreateChurchUseCase {
  constructor(private readonly churchesRepository: ChurchesRepository) {}

  async execute({
    name,
    address,
    lat,
    lon,
  }: CreateChurchUseCaseRequest): Promise<Result<CreateChurchUseCaseResponse, AppError>> {
    if (!address || address.trim() === '') {
      return err(new NoAddressError())
    }

    const duplicate = await this.findDuplicate({ name, lat, lon })

    if (duplicate) {
      return duplicate
    }

    const createResult = await this.churchesRepository.createChurch({
      name,
      address,
      lat,
      lon,
    })

    if (isErr(createResult)) {
      return createResult
    }

    return ok(createResult.value)
  }

  /**
   * A church is a duplicate if the name is taken, or if the name-and-coordinates
   * pair already exists. Both checks answer with the same error, so they are
   * asked in one place.
   */
  private async findDuplicate(params: {
    name: string
    lat: number
    lon: number
  }): Promise<Result<CreateChurchUseCaseResponse, AppError> | null> {
    const nameResult = await this.churchesRepository.findByName(params.name)

    if (isErr(nameResult)) {
      return nameResult
    }

    if (nameResult.value !== null) {
      return err(new ChurchAlreadyExistsError())
    }

    const paramsResult = await this.churchesRepository.findByParams(params)

    if (isErr(paramsResult)) {
      return paramsResult
    }

    return paramsResult.value === null ? null : err(new ChurchAlreadyExistsError())
  }
}
