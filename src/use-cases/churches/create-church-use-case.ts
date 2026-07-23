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
  geog?: unknown | null
  createdAt: Date
  updatedAt: Date
}

export class CreateChurchUseCase {
  constructor(private churchesRepository: ChurchesRepository) {}

  async execute({
    name,
    address,
    lat,
    lon,
  }: CreateChurchUseCaseRequest): Promise<Result<CreateChurchUseCaseResponse, AppError>> {
    if (!address || address.trim() === '') {
      return err(new NoAddressError())
    }

    const nameResult = await this.churchesRepository.findByName(name)
    if (isErr(nameResult)) {
      return nameResult
    }
    if (nameResult.value !== null) {
      return err(new ChurchAlreadyExistsError())
    }

    const paramsResult = await this.churchesRepository.findByParams({
      name,
      lat,
      lon,
    })
    if (isErr(paramsResult)) {
      return paramsResult
    }
    if (paramsResult.value !== null) {
      return err(new ChurchAlreadyExistsError())
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
}
