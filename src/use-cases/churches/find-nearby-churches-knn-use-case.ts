import { ChurchesRepository, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface FindNearbyChurchesKnnRequest {
  userLat: number
  userLon: number
}

interface FindNearbyChurchesKnnResponse {
  churches: NearbyChurch[]
  totalFound: number
}

export class FindNearbyChurchesKnnUseCase {
  constructor(private churchesRepository: ChurchesRepository) {}

  async execute({ userLat, userLon }: FindNearbyChurchesKnnRequest): Promise<Result<FindNearbyChurchesKnnResponse, AppError>> {
    if (userLat < -90 || userLat > 90) {
      return errOf(new LatitudeRangeError())
    }

    if (userLon < -180 || userLon > 180) {
      return errOf(new LongitudeRangeError())
    }

    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: 5,
    })

    if (isErr(result)) {
      return result
    }

    const churches = result.value

    return ok({
      churches,
      totalFound: churches.length,
    })
  }
}
