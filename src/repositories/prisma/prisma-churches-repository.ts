import { prisma } from '@lib/prisma'
import {
  ChurchesRepository,
  NearbyChurch,
  FindNearbyParams,
  Church,
  ChurchAlreadyExists,
} from '../../core/contracts/repository/churches-repository.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { CreateChurchError } from '@use-cases/errors/create-church-error'
import { mapPrismaChurchError } from 'errors/mappings/church-error-mapping'

interface RawChurch {
  id: number
  publicId: string
  name: string
  address: string | null
  lat: number
  lon: number
  distanceMeters: number
}

export class PrismaChurchesRepository implements ChurchesRepository {
  async findNearest({ userLat, userLon, limit = 20 }: FindNearbyParams): Promise<Result<NearbyChurch[], AppError>> {
    try {
      // For small datasets, we use a safety margin of 5x the requested limit
      // This ensures KNN approximations don't exclude actual nearest churches
      const knnCandidates = Math.max(100, limit * 5)

      const churches = await prisma.$queryRawUnsafe<RawChurch[]>(
        `
        WITH knn_candidates AS (
          -- Phase 1: Fast KNN pre-filtering using bounding box approximations
          SELECT id, geog
          FROM churches
          WHERE geog IS NOT NULL
          ORDER BY geog <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          LIMIT $4  -- Get more candidates than needed for accuracy
        )
        -- Phase 2: Exact distance calculation and sorting on the smaller candidate set
        SELECT 
          c.id,
          c.public_id as "publicId",
          c.name,
          c.address,
          c.lat,
          c.lon,
          ST_Distance(
            c.geog,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          ) as "distanceMeters"
        FROM knn_candidates knn
        JOIN churches c ON c.id = knn.id
        ORDER BY ST_Distance(
          c.geog,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) ASC
        LIMIT $3  -- Final accurate results
      `,
        userLat,
        userLon,
        limit,
        knnCandidates,
      )

      const mappedChurches = churches.map((church: RawChurch) => ({
        ...church,
        distanceMeters: parseFloat(Number(church.distanceMeters).toFixed(15)),
        distanceKm: parseFloat((church.distanceMeters / 1000).toFixed(15)),
      }))

      return ok(mappedChurches)
    } catch (error) {
      const mapped = mapPrismaChurchError(error)
      if (mapped) {
        return errOf(mapped)
      }
      return errOf(new DatabaseQueryError(error))
    }
  }

  async findByParams(params: ChurchAlreadyExists): Promise<Result<Church | null, AppError>> {
    try {
      const results = await prisma.$queryRaw<Church[]>`
        SELECT
          id,
          public_id as "publicId",
          name,
          address,
          lat,
          lon,
          geog::text as geog,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM churches
        WHERE 
          lower(trim(name)) = lower(trim(${params.name}))
          OR
          (
            round(lat::numeric, 6) = round(${params.lat}::numeric, 6)
            AND
            round(lon::numeric, 6) = round(${params.lon}::numeric, 6)
          )
        LIMIT 1
      `
      return ok(results[0] ?? null)
    } catch (error) {
      const mapped = mapPrismaChurchError(error)
      if (mapped) {
        return errOf(mapped)
      }
      return errOf(new DatabaseQueryError(error))
    }
  }

  async findByName(name: string): Promise<Result<Church | null, AppError>> {
    try {
      const results = await prisma.$queryRaw<Church[]>`
        SELECT
          id,
          public_id as "publicId",
          name,
          address,
          lat,
          lon,
          geog::text as geog,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM churches
        WHERE lower(trim(name)) = lower(trim(${name}))
        LIMIT 1
      `
      return ok(results[0] ?? null)
    } catch (error) {
      const mapped = mapPrismaChurchError(error)
      if (mapped) {
        return errOf(mapped)
      }
      return errOf(new DatabaseQueryError(error))
    }
  }

  async createChurch(
    data: Omit<Church, 'id' | 'publicId' | 'createdAt' | 'updatedAt' | 'geog'>,
  ): Promise<Result<Church, AppError>> {
    try {
      const rows = await prisma.$queryRaw<Church[]>`
        INSERT INTO churches (public_id, name, address, lat, lon, created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${data.name},
          ${data.address},
          ${data.lat},
          ${data.lon},
          NOW(),
          NOW()
          )
        RETURNING
          id,
          public_id AS "publicId",
          name,
          address,
          lat,
          lon,
          geog::text AS geog,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `
      const church = rows[0]
      if (!church) {
        return errOf(new CreateChurchError())
      }
      return ok(church)
    } catch (error) {
      const mapped = mapPrismaChurchError(error)
      if (mapped) {
        return errOf(mapped)
      }
      return errOf(new DatabaseQueryError(error))
    }
  }

  async deleteChurchByPublicId(publicId: string): Promise<Result<Church, AppError>> {
    try {
      const rows = await prisma.$queryRaw<Church[]>`
        DELETE FROM churches 
        WHERE public_id = ${publicId}
        RETURNING
          id,
          public_id AS "publicId",
          name,
          address,
          lat,
          lon,
          geog::text AS geog,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `
      const church = rows[0]
      if (!church) {
        return errOf(new ChurchNotFoundError())
      }
      return ok(church)
    } catch (error) {
      const mapped = mapPrismaChurchError(error)
      if (mapped) {
        return errOf(mapped)
      }
      return errOf(new DatabaseQueryError(error))
    }
  }
}
