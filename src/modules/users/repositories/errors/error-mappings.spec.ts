import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'

import { usersPrismaErrorMapping } from './users-prisma-error-mapping'
import { churchesPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-prisma-error-mapping'
import { formsPrismaErrorMapping } from '@modules/forms/repositories/errors/forms-prisma-error-mapping'
import {
  outboxDomainPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@infra/outbox/repositories/errors/outbox-prisma-error-mapping'

import { UserAlreadyExistsError } from '@modules/users/errors/user-already-exists-error'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { ChurchAlreadyExistsError } from '@modules/churches/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@modules/churches/errors/church-not-found-error'
import { FormAlreadyExistsError } from '@modules/forms/errors/form-already-exists-error'
import { FormNotFoundError } from '@modules/forms/errors/form-not-found-error'
import { FormSubmissionError } from '@modules/forms/errors/form-submission-error'
import {
  OutboxEventNotFoundDomainError,
  OutboxOperationFailedSystemError,
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
    ['users P2002', usersPrismaErrorMapping, 'P2002', UserAlreadyExistsError],
    ['users P2025', usersPrismaErrorMapping, 'P2025', UserNotFoundError],
    ['churches P2002', churchesPrismaErrorMapping, 'P2002', ChurchAlreadyExistsError],
    ['churches P2025', churchesPrismaErrorMapping, 'P2025', ChurchNotFoundError],
    ['forms P2002', formsPrismaErrorMapping, 'P2002', FormAlreadyExistsError],
    ['forms P2025', formsPrismaErrorMapping, 'P2025', FormNotFoundError],
    ['forms P2003', formsPrismaErrorMapping, 'P2003', FormSubmissionError],
    ['outbox-domain P2025', outboxDomainPrismaErrorMapping, 'P2025', OutboxEventNotFoundDomainError],
    ['outbox-domain P2003', outboxDomainPrismaErrorMapping, 'P2003', OutboxOperationFailedSystemError],
    ['outbox-infra P2025', outboxInfraPrismaErrorMapping, 'P2025', OutboxEventNotFoundInfraError],
    ['outbox-infra P2003', outboxInfraPrismaErrorMapping, 'P2003', OutboxOperationFailedInfraError],
  ])('%s maps to the expected AppError subclass', (_label, mapping, code, ExpectedError) => {
    const mapped = new PrismaErrorMapper(mapping).map(prismaError(code))
    expect(mapped).toBeInstanceOf(ExpectedError)
  })

  it.each([
    ['users', usersPrismaErrorMapping],
    ['churches', churchesPrismaErrorMapping],
    ['forms', formsPrismaErrorMapping],
    ['outbox-domain', outboxDomainPrismaErrorMapping],
    ['outbox-infra', outboxInfraPrismaErrorMapping],
  ])('%s table falls through to DatabaseQueryError for an unlisted code (P2016)', (_label, mapping) => {
    const mapped = new PrismaErrorMapper(mapping).map(prismaError('P2016'))
    expect(mapped).toBeInstanceOf(DatabaseQueryError)
  })

  it('outbox-infra factories forward the originating Prisma error as the cause', () => {
    const source = prismaError('P2025')
    const mapped = new PrismaErrorMapper(outboxInfraPrismaErrorMapping).map(source) as OutboxEventNotFoundInfraError

    expect(mapped.cause ?? mapped.originalError).toBe(source)
  })
})
