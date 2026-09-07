import { Prisma } from '@prisma/client'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { IErrorMapper } from 'core/contracts/errors/error-mapper.interface'
import { safeLookup } from 'core/shared/safe-lookup'

export type PrismaErrorMappingConfig<E extends AppError> = {
  P2000?: (error: Prisma.PrismaClientKnownRequestError) => E // Value too long for column
  P2001?: (error: Prisma.PrismaClientKnownRequestError) => E // Record not found in where condition
  P2002?: (error: Prisma.PrismaClientKnownRequestError) => E // Unique constraint violation
  P2003?: (error: Prisma.PrismaClientKnownRequestError) => E // Foreign key constraint failed
  P2014?: (error: Prisma.PrismaClientKnownRequestError) => E // Relation violation
  P2015?: (error: Prisma.PrismaClientKnownRequestError) => E // Related record not found
  P2016?: (error: Prisma.PrismaClientKnownRequestError) => E // Query interpretation error
  P2021?: (error: Prisma.PrismaClientKnownRequestError) => E // Table does not exist
  P2022?: (error: Prisma.PrismaClientKnownRequestError) => E // Column does not exist
  P2025?: (error: Prisma.PrismaClientKnownRequestError) => E // Record not found (update/delete)
  [key: string]: ((error: Prisma.PrismaClientKnownRequestError) => E) | undefined
}

export class PrismaErrorMapper<E extends AppError> implements IErrorMapper {
  constructor(private readonly errorMapping: PrismaErrorMappingConfig<E>) {}

  mapToKnownError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const errorFactory = safeLookup(this.errorMapping, error.code)
      if (errorFactory) {
        return errorFactory(error)
      }
    }

    return new DatabaseQueryError(error)
  }
}
