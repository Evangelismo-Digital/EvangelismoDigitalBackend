/**
 * Regression — CodeQL js/log-injection (CWE-117) in searchUsersController.
 *
 * What broke: the controller interpolated the raw `query` querystring value into
 * the log MESSAGE (`Encontrados N usuários para a consulta: "<query>" ...`). The
 * message is the human-read part of every log line and what log tooling
 * groups and alerts on, so a caller could forge content there — a quote to
 * break out of the sentence, a newline and a fake second entry for any
 * non-JSON sink (pino-pretty, `docker logs`, a terminal).
 *
 * Why it mattered: an authenticated caller controlled text that operators read
 * as the application's own words.
 *
 * The fix moves the value into a structured field, which pino JSON-encodes,
 * and keeps the message a constant.
 */
import type { FastifyReply } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('@modules/users/factories/make-search-users.service', () => ({
  makeSearchUsersUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { searchUsersController } from './search-users.controller'
import { logger } from '@infra/logger'
import { ok } from '@common/utils/result'

const FORGED = 'maria"\n{"level":50,"msg":"admin password reset"}'

function makeRequest(query: string, page = 1) {
  return { query: { query, page } } as never
}

function makeReply() {
  return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as FastifyReply
}

describe('searchUsersController — log injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(ok({ users: [] }))
  })

  it('never puts the caller-supplied query in the log message', async () => {
    await searchUsersController(makeRequest(FORGED), makeReply())

    for (const call of vi.mocked(logger.info).mock.calls) {
      const message = call.find((arg) => typeof arg === 'string')
      expect(message).not.toContain('maria')
      expect(message).not.toContain('\n')
    }
  })

  it('still records the query, page and match count as structured fields', async () => {
    // Counterweight: the fix must not satisfy the first case by dropping the
    // log line — the search stays observable, just not as free text.
    await searchUsersController(makeRequest(FORGED, 3), makeReply())

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith({ query: FORGED, page: 3, count: 0 }, expect.any(String))
  })
})
