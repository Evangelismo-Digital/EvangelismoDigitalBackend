import { describe, it, expect, vi } from 'vitest'
import type { FastifyReply } from 'fastify'
import { HttpErrorMapper } from './http-error-mapper'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { ZodValidationError } from './zod-validation-error'

function makeReply(sent = false) {
  const reply = {
    sent,
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply & typeof reply
}

describe('HttpErrorMapper.map', () => {
  it('serializes a DomainError to its mapped HTTP status with code/message/issues', () => {
    const reply = makeReply()
    const error = new UserNotFoundError()

    HttpErrorMapper.map(error, reply)

    expect(reply.code).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      message: error.body.message,
      code: error.body.code,
      issues: error.body.issues,
    })
  })

  it('rethrows a ZodValidationError (an AppError, not a DomainError) for the global handler', () => {
    const reply = makeReply()
    const error = new ZodValidationError({ name: ['obrigatório'] })

    expect(() => HttpErrorMapper.map(error, reply)).toThrow(error)
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('rethrows infrastructure errors instead of serializing them', () => {
    const reply = makeReply()
    const error = new DatabaseQueryError(new Error('boom'))

    expect(() => HttpErrorMapper.map(error, reply)).toThrow(error)
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('rethrows plain unknown errors', () => {
    const reply = makeReply()
    const error = new Error('totally unknown')

    expect(() => HttpErrorMapper.map(error, reply)).toThrow(error)
  })

  it('rethrows the error untouched when the reply was already sent, even for a DomainError', () => {
    const reply = makeReply(true)
    const error = new UserNotFoundError()

    expect(() => HttpErrorMapper.map(error, reply)).toThrow(error)
    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })
})
