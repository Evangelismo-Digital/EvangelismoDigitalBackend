import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { PrismaErrorMapper } from './prisma-error-mapper'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`prisma ${code}`, {
    code,
    clientVersion: '7.9.1',
  })
}

const mapping = {
  P2002: () => new UserAlreadyExistsError(),
  P2025: () => new UserNotFoundError(),
}

describe('PrismaErrorMapper.mapToKnownError', () => {
  const mapper = new PrismaErrorMapper(mapping)

  it('returns an AppError unchanged (already mapped upstream)', () => {
    const original = new UserNotFoundError()
    expect(mapper.mapToKnownError(original)).toBe(original)
  })

  it('invokes the configured factory for a known Prisma error code', () => {
    expect(mapper.mapToKnownError(knownError('P2002'))).toBeInstanceOf(UserAlreadyExistsError)
    expect(mapper.mapToKnownError(knownError('P2025'))).toBeInstanceOf(UserNotFoundError)
  })

  it('passes the Prisma error into the factory', () => {
    let received: unknown
    const spyMapper = new PrismaErrorMapper({
      P2002: (e) => {
        received = e
        return new UserAlreadyExistsError()
      },
    })
    const prismaError = knownError('P2002')

    spyMapper.mapToKnownError(prismaError)

    expect(received).toBe(prismaError)
  })

  it('falls back to DatabaseQueryError for an unmapped known Prisma code', () => {
    const mapped = mapper.mapToKnownError(knownError('P2003'))
    expect(mapped).toBeInstanceOf(DatabaseQueryError)
  })

  it('falls back to DatabaseQueryError for a non-Prisma, non-AppError value', () => {
    expect(mapper.mapToKnownError(new Error('generic'))).toBeInstanceOf(DatabaseQueryError)
    expect(mapper.mapToKnownError('a string')).toBeInstanceOf(DatabaseQueryError)
    expect(mapper.mapToKnownError(undefined)).toBeInstanceOf(DatabaseQueryError)
  })

  it('wraps the original cause inside the fallback DatabaseQueryError', () => {
    const cause = new Error('root cause')
    const mapped = mapper.mapToKnownError(cause) as DatabaseQueryError
    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped.cause ?? mapped.originalError).toBe(cause)
  })
})
