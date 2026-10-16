import type { FastifyReply } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('@use-cases/factories/make-search-users-use-case', () => ({
  makeSearchUsersUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { searchUsersController } from './search-users.controller'
import { logger } from '@lib/logger'
import { err, ok } from 'core/shared/result'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

function makeRequest(query = 'maria', page = 2) {
  return { query: { query, page } } as any
}

function makeReply() {
  return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as FastifyReply
}

describe('searchUsersController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(ok({ users: [] }))
  })

  it('hands the query and page from the querystring to the use-case', async () => {
    await searchUsersController(makeRequest('maria', 2), makeReply())

    expect(mockExecute).toHaveBeenCalledWith({ query: 'maria', page: 2 })
  })

  it('answers 200 with an empty list when nothing matches', async () => {
    const reply = makeReply()

    await searchUsersController(makeRequest(), reply)

    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith({ users: [] })
  })

  it('logs how many users matched, for which query and page', async () => {
    await searchUsersController(makeRequest('maria', 2), makeReply())

    expect(logger.info).toHaveBeenCalledWith('Encontrados 0 usuários para a consulta: "maria" na página 2.')
  })

  it('delegates a domain failure to the HTTP error mapper', async () => {
    mockExecute.mockResolvedValue(err(new UserNotFoundError()))
    const reply = makeReply()

    await searchUsersController(makeRequest(), reply)

    expect(reply.code).toHaveBeenCalledWith(404)
    expect(reply.code).not.toHaveBeenCalledWith(200)
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('rethrows an infrastructure failure for the global handler to sanitize', async () => {
    mockExecute.mockResolvedValue(err(new DatabaseQueryError(new Error('connection reset'))))

    await expect(searchUsersController(makeRequest(), makeReply())).rejects.toBeInstanceOf(DatabaseQueryError)
  })
})
