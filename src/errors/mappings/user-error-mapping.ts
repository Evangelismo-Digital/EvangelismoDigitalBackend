import { Prisma } from '@prisma/client'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { DatabaseQueryError } from '../infrastructure/database-query-error'
import { AppError } from 'errors/app-error'

type PrismaErrorCode = string

const USER_PRISMA_ERROR_MAP: Record<PrismaErrorCode, () => AppError> = {
  P2002: () => new UserAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new UserNotFoundError(), // Record not found (delete/update)
}

/**
 * Maps Prisma errors to User domain/infrastructure errors.
 *
 * Handles:
 * - PrismaClientKnownRequestError: structured error codes (P2002, P2025, etc.)
 * - PrismaClientUnknownRequestError: SQL failures
 */
export function mapPrismaUserError(error: unknown): AppError | null {
  // Structured Prisma errors (P2002, P2025, etc.)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const factory = USER_PRISMA_ERROR_MAP[error.code]
    return factory ? factory() : null
  }

  // Raw SQL / other query failures
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new DatabaseQueryError(error)
  }

  return null
}
