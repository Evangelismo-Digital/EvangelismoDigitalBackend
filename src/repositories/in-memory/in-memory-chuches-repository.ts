import {
  ChurchesRepository,
  Church,
  ChurchAlreadyExists,
  NearbyChurch,
  FindNearbyParams,
} from 'core/contracts/repository/churches-repository.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { randomUUID } from 'node:crypto'

interface InMemoryNearbyChurch extends NearbyChurch {
  publicId: string
}

export class InMemoryChurchesRepository implements ChurchesRepository {
  public items: Church[] = []

  async findNearest(params: FindNearbyParams): Promise<Result<NearbyChurch[], AppError>> {
    const { userLat, userLon, limit = 10, maxRadiusMeters = 50000 } = params

    // Calculate distance using Haversine formula
    const churchesWithDistance = this.items.map((church) => {
      const R = 6371000 // Earth's radius in meters
      const φ1 = (userLat * Math.PI) / 180
      const φ2 = (church.lat * Math.PI) / 180
      const Δφ = ((church.lat - userLat) * Math.PI) / 180
      const Δλ = ((church.lon - userLon) * Math.PI) / 180

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      const distanceMeters = R * c
      const distanceKm = distanceMeters / 1000

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

    // Filter by max radius and sort by distance
    const filtered = churchesWithDistance
      .filter((church) => church.distanceMeters <= maxRadiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit)

    return ok(filtered)
  }

  async findByParams(params: ChurchAlreadyExists): Promise<Result<Church | null, AppError>> {
    const church = this.items.find(
      (item) => item.name === params.name && item.lat === params.lat && item.lon === params.lon,
    )

    return ok(church ?? null)
  }

  async findByName(name: string): Promise<Result<Church | null, AppError>> {
    const church = this.items.find((item) => item.name === name)

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
      return errOf(new ChurchNotFoundError())
    }

    const [deletedChurch] = this.items.splice(churchIndex, 1)
    return ok(deletedChurch)
  }
}
