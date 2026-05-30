import { ChurchesRepository, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'

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

  async execute({ userLat, userLon }: FindNearbyChurchesKnnRequest): Promise<FindNearbyChurchesKnnResponse> {
    if (userLat < -90 || userLat > 90) {
      throw new LatitudeRangeError()
    }

    if (userLon < -180 || userLon > 180) {
      throw new LongitudeRangeError()
    }

    const churches = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: 5,
    })

    return {
      churches,
      totalFound: churches.length,
    }
  }
}
