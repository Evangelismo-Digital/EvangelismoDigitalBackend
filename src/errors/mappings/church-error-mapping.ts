import { Prisma } from '@prisma/client'
import { ChurchAlreadyExistsError } from '@use-cases/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { DatabaseQueryError } from '../infrastructure/database-query-error'
import { AppError } from 'errors/app-error'

type PrismaErrorCode = string

const CHURCH_PRISMA_ERROR_MAP: Record<PrismaErrorCode, () => AppError> = {
  'P2002': () => new ChurchAlreadyExistsError(),  // Unique constraint violation (create)
  'P2025': () => new ChurchNotFoundError(),        // Record not found (delete/update)
}

/**
 * Maps Prisma errors to Church domain/infrastructure errors.
 *
 * Handles:
 * - PrismaClientKnownRequestError: structured error codes (P2002, P2025, etc.)
 * - PrismaClientUnknownRequestError: raw SQL failures from $queryRawUnsafe
 *   (e.g., PostGIS KNN queries with ST_Distance, ST_DWithin, geog operator errors)
 */
export function mapPrismaChurchError(error: unknown): AppError | null {
  // Structured Prisma errors (P2002, P2025, etc.)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const factory = CHURCH_PRISMA_ERROR_MAP[error.code]
    return factory ? factory() : null
  }

  // Raw SQL / PostGIS failures ($queryRawUnsafe errors)
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new DatabaseQueryError(error)
  }

  return null
}
