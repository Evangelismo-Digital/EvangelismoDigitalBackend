import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'

import { userPrismaErrorMapping } from './users-error-mapping'
import { churchPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-error-mapping'
import { formsPrismaErrorMapping } from '@modules/forms/repositories/errors/forms-error-mapping'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@infra/outbox/repositories/errors/outbox-error-mapping'

import { UserAlreadyExistsError } from '@modules/users/errors/user-already-exists-error'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { ChurchAlreadyExistsError } from '@modules/churches/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@modules/churches/errors/church-not-found-error'
import { FormsAlreadyExistsError } from '@modules/forms/errors/forms-already-exists-error'
import { FormsNotFoundError } from '@modules/forms/errors/forms-not-found-error'
import { FormsSubmissionError } from '@modules/forms/errors/forms-submission-error'
import {
  OutboxEventNotFoundHttpError,
  OutboxOperationFailedHttpError,
  OutboxEventNotFoundInfraError,
  OutboxOperationFailedInfraError,
} from '@infra/outbox/errors/outbox-errors'
import { DatabaseQueryError } from '@common/errors/infrastructure/database-query-error'

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
    code,
    clientVersion: '7.9.1',
  })
}

describe('Prisma error-mapping tables (via PrismaErrorMapper)', () => {
  it.each([
    ['users P2002', userPrismaErrorMapping, 'P2002', UserAlreadyExistsError],
    ['users P2025', userPrismaErrorMapping, 'P2025', UserNotFoundError],
    ['churches P2002', churchPrismaErrorMapping, 'P2002', ChurchAlreadyExistsError],
    ['churches P2025', churchPrismaErrorMapping, 'P2025', ChurchNotFoundError],
    ['forms P2002', formsPrismaErrorMapping, 'P2002', FormsAlreadyExistsError],
    ['forms P2025', formsPrismaErrorMapping, 'P2025', FormsNotFoundError],
    ['forms P2003', formsPrismaErrorMapping, 'P2003', FormsSubmissionError],
    ['outbox-http P2025', outboxHttpPrismaErrorMapping, 'P2025', OutboxEventNotFoundHttpError],
    ['outbox-http P2003', outboxHttpPrismaErrorMapping, 'P2003', OutboxOperationFailedHttpError],
    ['outbox-infra P2025', outboxInfraPrismaErrorMapping, 'P2025', OutboxEventNotFoundInfraError],
    ['outbox-infra P2003', outboxInfraPrismaErrorMapping, 'P2003', OutboxOperationFailedInfraError],
  ])('%s maps to the expected AppError subclass', (_label, mapping, code, ExpectedError) => {
    const mapped = new PrismaErrorMapper(mapping).mapToKnownError(prismaError(code))
    expect(mapped).toBeInstanceOf(ExpectedError)
  })

  it.each([
    ['users', userPrismaErrorMapping],
    ['churches', churchPrismaErrorMapping],
    ['forms', formsPrismaErrorMapping],
    ['outbox-http', outboxHttpPrismaErrorMapping],
    ['outbox-infra', outboxInfraPrismaErrorMapping],
  ])('%s table falls through to DatabaseQueryError for an unlisted code (P2016)', (_label, mapping) => {
    const mapped = new PrismaErrorMapper(mapping).mapToKnownError(prismaError('P2016'))
    expect(mapped).toBeInstanceOf(DatabaseQueryError)
  })

  it('outbox-infra factories forward the originating Prisma error as the cause', () => {
    const source = prismaError('P2025')
    const mapped = new PrismaErrorMapper(outboxInfraPrismaErrorMapping).mapToKnownError(
      source,
    ) as OutboxEventNotFoundInfraError

    expect(mapped.cause ?? mapped.originalError).toBe(source)
  })
})
