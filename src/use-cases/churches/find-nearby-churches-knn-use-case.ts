import { ChurchesRepository, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { CHURCH_CONSTANTS } from 'messages/constants/churches/churches'

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

  async execute({
    userLat,
    userLon,
  }: FindNearbyChurchesKnnRequest): Promise<Result<FindNearbyChurchesKnnResponse, AppError>> {
    if (userLat < -90 || userLat > 90) {
      return err(new LatitudeRangeError())
    }

    if (userLon < -180 || userLon > 180) {
      return err(new LongitudeRangeError())
    }

    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: CHURCH_CONSTANTS.KNN_LIMIT,
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
