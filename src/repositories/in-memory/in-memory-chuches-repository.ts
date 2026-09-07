import {
  ChurchesRepository,
  Church,
  ChurchAlreadyExists,
  NearbyChurch,
  FindNearbyParams,
} from 'core/contracts/repository/churches-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { randomUUID } from 'node:crypto'
import {
  COORDINATE_DECIMAL_PLACES,
  DEGREES_TO_RADIANS,
  EARTH_RADIUS_METERS,
  METERS_PER_KILOMETER,
} from 'core/constants/geo'

/** `lower(trim(...))` in the SQL. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** `round(...::numeric, 6)` in the SQL. */
function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMAL_PLACES))
}

export class InMemoryChurchesRepository implements ChurchesRepository {
  public items: Church[] = []

  async findNearest(params: FindNearbyParams): Promise<Result<NearbyChurch[], AppError>> {
    const { userLat, userLon, limit = 10 } = params

    // Calculate distance using Haversine formula
    const churchesWithDistance = this.items.map((church) => {
      // Haversine. The Greek names match the textbook formula but are not
      // typable on most keyboards and read as boxes in several terminals, so
      // they are spelled out: lat1/lat2 for the two latitudes in radians,
      // deltaLat/deltaLon for the differences.
      const lat1 = userLat * DEGREES_TO_RADIANS
      const lat2 = church.lat * DEGREES_TO_RADIANS
      const deltaLat = (church.lat - userLat) * DEGREES_TO_RADIANS
      const deltaLon = (church.lon - userLon) * DEGREES_TO_RADIANS

      const halfChordSquared =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
      const angularDistance = 2 * Math.atan2(Math.sqrt(halfChordSquared), Math.sqrt(1 - halfChordSquared))

      const distanceMeters = EARTH_RADIUS_METERS * angularDistance
      const distanceKm = distanceMeters / METERS_PER_KILOMETER

      return {
        id: church.id,
        publicId: church.publicId,
        name: church.name,
        address: church.address,
        lat: church.lat,
        lon: church.lon,
        distanceMeters,
        distanceKm,
      }
    })

    // Nearest first, capped at `limit` — matching the Prisma implementation,
    // which applies no radius cut-off of its own.
    const nearest = churchesWithDistance.toSorted((a, b) => a.distanceMeters - b.distanceMeters).slice(0, limit)

    return ok(nearest)
  }

  /**
   * Mirrors the Prisma predicate: the same *name* OR the same *coordinates*
   * makes a church a duplicate — not both together. The double previously
   * required all three to match, making it strictly more permissive than
   * production, so a duplicate that the real database rejects would have been
   * accepted here. Names are compared trimmed and case-insensitively, and
   * coordinates rounded to six decimals, exactly as the SQL does.
   */
  async findByParams(params: ChurchAlreadyExists): Promise<Result<Church | null, AppError>> {
    const church = this.items.find(
      (item) =>
        normalizeName(item.name) === normalizeName(params.name) ||
        (roundCoordinate(item.lat) === roundCoordinate(params.lat) &&
          roundCoordinate(item.lon) === roundCoordinate(params.lon)),
    )

    return ok(church ?? null)
  }

  async findByName(name: string): Promise<Result<Church | null, AppError>> {
    const church = this.items.find((item) => normalizeName(item.name) === normalizeName(name))

    return ok(church ?? null)
  }

  async createChurch(
    data: Omit<Church, 'id' | 'publicId' | 'createdAt' | 'updatedAt' | 'geog'>,
  ): Promise<Result<Church, AppError>> {
    const now = new Date()
    const church: Church = {
      id: this.items.length + 1,
      publicId: randomUUID(),
      name: data.name,
      address: data.address,
      lat: data.lat,
      lon: data.lon,
      geog: null,
      createdAt: now,
      updatedAt: now,
    }

    this.items.push(church)
    return ok(church)
  }

  async deleteChurchByPublicId(publicId: string): Promise<Result<Church, AppError>> {
    const churchIndex = this.items.findIndex((item) => item.publicId === publicId)

    if (churchIndex === -1) {
      return err(new ChurchNotFoundError())
    }

    const [deletedChurch] = this.items.splice(churchIndex, 1)
    return ok(deletedChurch)
  }
}
