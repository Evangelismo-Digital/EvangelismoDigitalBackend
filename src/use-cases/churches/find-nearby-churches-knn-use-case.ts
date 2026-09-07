import { ChurchesRepository, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { CHURCH_CONSTANTS } from 'messages/constants/churches/churches'
import { MAX_LATITUDE, MAX_LONGITUDE, MIN_LATITUDE, MIN_LONGITUDE } from 'core/constants/geo'

interface FindNearbyChurchesKnnRequest {
  userLat: number
  userLon: number
  /**
   * The caller's budget. The query gets `min(KNN_BUDGET_MS, what is left)`, so
   * the one leg the driver cannot cancel is still bounded by the request.
   */
  deadline?: Deadline
}

interface FindNearbyChurchesKnnResponse {
  churches: NearbyChurch[]
  totalFound: number
}

/** Rejects out-of-range coordinates before they reach PostGIS. */
function validateCoordinates(userLat: number, userLon: number): Result<never, AppError> | null {
  if (userLat < MIN_LATITUDE || userLat > MAX_LATITUDE) {
    return err(new LatitudeRangeError())
  }

  if (userLon < MIN_LONGITUDE || userLon > MAX_LONGITUDE) {
    return err(new LongitudeRangeError())
  }

  return null
}

/**
 * The query's ceiling: its own cap, or whatever is left of the request —
 * whichever is smaller. An unbounded caller gets no `SET LOCAL` at all, keeping
 * the extra transaction off the path for workers and scripts.
 */
function knnTimeoutMs(deadline: Deadline): number | undefined {
  const remaining = deadline.remainingMs()

  return remaining === Infinity ? undefined : Math.min(CHURCH_CONSTANTS.KNN_BUDGET_MS, remaining)
}

export class FindNearbyChurchesKnnUseCase {
  constructor(private readonly churchesRepository: ChurchesRepository) {}

  async execute({
    userLat,
    userLon,
    deadline = Deadline.none(),
  }: FindNearbyChurchesKnnRequest): Promise<Result<FindNearbyChurchesKnnResponse, AppError>> {
    const invalidCoordinates = validateCoordinates(userLat, userLon)
    if (invalidCoordinates) {
      return invalidCoordinates
    }

    if (deadline.expired) {
      return err(deadline.asError())
    }

    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: CHURCH_CONSTANTS.KNN_LIMIT,
      timeoutMs: knnTimeoutMs(deadline),
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
