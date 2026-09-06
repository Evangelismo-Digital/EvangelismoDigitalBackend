import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()

vi.mock('@use-cases/factories/make-find-nearest-churches-use-case', () => ({
  makeFindNearestChurchesUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { findNearestChurches } from './find-nearest-churches.controller'
import { logger } from '@lib/logger'
import { Deadline } from 'core/shared/deadline'
import { ok, err } from 'core/shared/result'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

const response = {
  nearestChurchesInfo: [],
  totalFound: 0,
  precision: 'ROOFTOP',
  coordinatesProviderName: 'LocationIQ',
}

function makeRequest(deadline: Deadline, cep = '01310100') {
  return { query: { cep }, ip: '203.0.113.10', deadline } as unknown as FastifyRequest<{
    Querystring: { cep: string }
  }>
}

function makeReply() {
  return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as FastifyReply
}

describe('findNearestChurches controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(ok(response))
  })

  it('hands the request budget to the use-case', async () => {
    // The wiring that carries the whole deadline model across the HTTP
    // boundary. If it is dropped the budget silently stops applying, and
    // nothing else fails visibly.
    const deadline = Deadline.in(8_000)

    await findNearestChurches(makeRequest(deadline), makeReply())

    expect(mockExecute).toHaveBeenCalledWith({ cep: '01310100', deadline })
  })

  it('passes the very deadline the plugin attached, not a fresh one', async () => {
    const deadline = Deadline.in(8_000)

    await findNearestChurches(makeRequest(deadline), makeReply())

    expect(mockExecute.mock.calls[0][0].deadline).toBe(deadline)
  })

  it('answers 200 with the use-case response on success', async () => {
    const reply = makeReply()

    await findNearestChurches(makeRequest(Deadline.none()), reply)

    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith(response)
  })

  it('delegates a domain failure to the HTTP error mapper', async () => {
    mockExecute.mockResolvedValue(err(new InvalidCepError('01310100')))
    const reply = makeReply()

    await findNearestChurches(makeRequest(Deadline.none()), reply)

    expect(reply.code).toHaveBeenCalledWith(404)
    expect(reply.send).not.toHaveBeenCalledWith(response)
  })

  it('rethrows an infrastructure failure for the global handler to sanitize', async () => {
    // HttpErrorMapper only serializes DomainError; anything else must escape so
    // the error-handler plugin can strip its internals.
    mockExecute.mockResolvedValue(err(new DatabaseQueryError(new Error('connection reset'))))

    await expect(findNearestChurches(makeRequest(Deadline.none()), makeReply())).rejects.toBeInstanceOf(
      DatabaseQueryError,
    )
  })

  describe('request logging', () => {
    it('records the caller IP on the way in, for rate-limit and abuse triage', async () => {
      await findNearestChurches(makeRequest(Deadline.none()), makeReply())

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '203.0.113.10', msg: expect.stringContaining('Cep') }),
      )
    })

    it('records the churches it answered with', async () => {
      await findNearestChurches(makeRequest(Deadline.none()), makeReply())

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          nearestChurchesInfo: response.nearestChurchesInfo,
          msg: expect.stringContaining('sucesso'),
        }),
      )
    })
  })

  it('rejects a malformed CEP before reaching the use-case', async () => {
    await expect(findNearestChurches(makeRequest(Deadline.none(), 'not-a-cep'), makeReply())).rejects.toThrow()

    expect(mockExecute).not.toHaveBeenCalled()
  })
})
