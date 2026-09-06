import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **the tightest budget must not become an unbounded query.**
 *
 * Postgres reads `statement_timeout = 0` as *no limit at all*. The KNN ceiling
 * is derived from whatever is left of the request budget, so a caller down to
 * its last fraction of a millisecond rounds to zero — and the naive
 * `Math.floor(timeoutMs)` would then hand the database a query with no ceiling
 * whatsoever, precisely when the request had least time to spare. The inversion
 * is silent: no error, no warning, just an unbounded scan on an exhausted
 * request.
 *
 * Guards the floor of 1ms in `toStatementTimeout`. Defect D10 in
 * docs/timeout-and-cancellation-model.md.
 */

const mockQueryRawUnsafe = vi.fn()
const mockExecuteRawUnsafe = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
    $transaction: (callback: (tx: unknown) => unknown) => mockTransaction(callback),
  },
}))

import { PrismaChurchesRepository } from './prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from './errors/churches-error-mapping'
import { isOk } from 'core/shared/result'

/** The `SET LOCAL statement_timeout = N` the repository issued, as a number. */
function statementTimeoutIssued(): number {
  const sql = mockExecuteRawUnsafe.mock.calls[0][0] as string
  const match = sql.match(/statement_timeout = (-?\d+)/)

  expect(match).not.toBeNull()
  return Number(match![1])
}

describe('regression: a sub-millisecond budget must not disable the statement timeout', () => {
  let repository: PrismaChurchesRepository

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRawUnsafe.mockResolvedValue([])
    mockExecuteRawUnsafe.mockResolvedValue(0)
    // Run the interactive transaction callback against the same fakes.
    mockTransaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
        $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
      }),
    )

    repository = new PrismaChurchesRepository(new PrismaErrorMapper(churchPrismaErrorMapping))
  })

  it.each([
    ['a fraction of a millisecond', 0.4],
    ['exactly zero', 0],
    ['a negative budget', -50],
  ])('floors %s at 1ms rather than at 0 (which Postgres reads as "no limit")', async (_label, timeoutMs) => {
    await repository.findNearest({ userLat: -23.55, userLon: -46.63, timeoutMs })

    expect(statementTimeoutIssued()).toBe(1)
    expect(statementTimeoutIssued()).toBeGreaterThan(0)
  })

  it.each([
    ['a whole millisecond count', 1_000, 1_000],
    ['a fractional remainder, rounded down', 999.9, 999],
  ])('passes %s through unchanged', async (_label, timeoutMs, expected) => {
    await repository.findNearest({ userLat: -23.55, userLon: -46.63, timeoutMs })

    expect(statementTimeoutIssued()).toBe(expected)
  })

  it('always issues an integer — Postgres rejects a fractional setting', async () => {
    await repository.findNearest({ userLat: -23.55, userLon: -46.63, timeoutMs: 123.456 })

    expect(Number.isInteger(statementTimeoutIssued())).toBe(true)
  })

  describe('the transaction is taken only when a ceiling is asked for', () => {
    it('wraps the query so SET LOCAL applies to it', async () => {
      await repository.findNearest({ userLat: -23.55, userLon: -46.63, timeoutMs: 500 })

      // SET LOCAL is scoped to a transaction; without one it silently does nothing.
      expect(mockTransaction).toHaveBeenCalledOnce()
      expect(mockExecuteRawUnsafe).toHaveBeenCalledOnce()
    })

    it('skips the transaction entirely for an unbounded caller', async () => {
      const result = await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      expect(mockTransaction).not.toHaveBeenCalled()
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalled()
      expect(mockQueryRawUnsafe).toHaveBeenCalledOnce()
      expect(isOk(result)).toBe(true)
    })
  })
})
