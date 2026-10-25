import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Regression: **request-validation 400s came back without a `code`.**
 *
 * `GET /churches/nearest?cep=123` answered `{ message }` only, while every other
 * error carries `{ message, code }`. Schema validation from
 * fastify-type-provider-zod reaches the error handler as a Fastify validation
 * error (`statusCode` 400 plus a `validation` array), not as a `ZodError`, so it
 * took the generic Fastify branch, which forwards only the message. Clients had
 * to special-case it. Found by the frontend's real-backend suite. Defect:
 * validation 400 without code (2026-10-25).
 */

vi.mock('@infra/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@sentry/node', () => ({ captureException: vi.fn(), withScope: vi.fn() }))

import Fastify, { FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { errorHandler } from './error-handler.filter'
import { VALIDATION_ERRORS } from '@common/messages/errors/validation'

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(errorHandler)

  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/probe',
      { schema: { querystring: z.object({ cep: z.string().regex(/^\d{8}$/, 'CEP inválido.') }) } },
      async () => ({ ok: true }),
    )
  app.get('/unauthorized', async () => {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  })
  app.get('/validation-key-without-list', async () => {
    throw Object.assign(new Error('Bad Request'), { statusCode: 400, validation: undefined })
  })

  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('Regression: request-validation 400s came back without a code', () => {
  it('answers a schema failure with the VALIDATION_ERROR code and keeps the message', async () => {
    const response = await app.inject({ method: 'GET', url: '/probe?cep=123' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      message: 'querystring/cep CEP inválido.',
      code: VALIDATION_ERRORS.ZOD_VALIDATION.code,
    })
  })

  it('leaves other Fastify errors as they were', async () => {
    // Counterweight: only validation failures are labelled; a 401 must not be
    // relabelled as a validation error.
    const response = await app.inject({ method: 'GET', url: '/unauthorized' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ message: 'Unauthorized' })
  })

  it('labels only errors that carry an actual list of validation issues', async () => {
    const response = await app.inject({ method: 'GET', url: '/validation-key-without-list' })

    expect(response.json()).toEqual({ message: 'Bad Request' })
  })
})
