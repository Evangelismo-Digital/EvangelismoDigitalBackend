import {
  AppError,
  OutboxEventNotFoundHttpError,
  OutboxEventNotFoundInfraError,
  OutboxOperationFailedHttpError,
  OutboxOperationFailedInfraError,
} from 'errors'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'
import { Prisma } from '@prisma/client'

export const outboxHttpPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2025: () => new OutboxEventNotFoundHttpError(),
  P2003: () => new OutboxOperationFailedHttpError(),
}

export const outboxInfraPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2025: (error: Prisma.PrismaClientKnownRequestError) => new OutboxEventNotFoundInfraError(error),
  P2003: (error: Prisma.PrismaClientKnownRequestError) => new OutboxOperationFailedInfraError(error),
}
