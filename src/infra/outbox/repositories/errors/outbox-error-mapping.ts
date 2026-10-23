import {
  OutboxEventNotFoundHttpError,
  OutboxEventNotFoundInfraError,
  OutboxOperationFailedHttpError,
  OutboxOperationFailedInfraError,
} from '@infra/outbox/errors/outbox-errors'
import { PrismaErrorMappingConfig } from '@infra/database/prisma/utils/prisma-error-mapper'
import { AppError } from '@common/errors/app-error'
import { Prisma } from '@prisma/client'

export const outboxHttpPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2025: () => new OutboxEventNotFoundHttpError(),
  P2003: () => new OutboxOperationFailedHttpError(),
}

export const outboxInfraPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2025: (error: Prisma.PrismaClientKnownRequestError) => new OutboxEventNotFoundInfraError(error),
  P2003: (error: Prisma.PrismaClientKnownRequestError) => new OutboxOperationFailedInfraError(error),
}
