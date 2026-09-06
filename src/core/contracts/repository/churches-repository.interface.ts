import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface ChurchAlreadyExists {
  name: string
  lat: number
  lon: number
}

export interface NearbyChurch {
  id: number
  publicId: string
  name: string
  address: string | null
  lat: number
  lon: number
  distanceKm: number
  distanceMeters: number
}

export interface FindNearbyParams {
  userLat: number
  userLon: number
  limit?: number
  /**
   * Ceiling for the query itself, in milliseconds.
   *
   * Deliberately a number rather than a `Deadline`: this contract is consumed
   * by adapters that have no business knowing about the request budget, and the
   * caller has already reduced its remaining time to a single figure.
   */
  timeoutMs?: number
}

export interface Church {
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

export interface ChurchesRepository {
  findNearest(params: FindNearbyParams): Promise<Result<NearbyChurch[], AppError>>
  findByParams(params: ChurchAlreadyExists): Promise<Result<Church | null, AppError>>
  findByName(name: string): Promise<Result<Church | null, AppError>>
  createChurch(
    data: Omit<Church, 'id' | 'publicId' | 'createdAt' | 'updatedAt' | 'geog'>,
  ): Promise<Result<Church, AppError>>
  deleteChurchByPublicId(publicId: string): Promise<Result<Church, AppError>>
}
