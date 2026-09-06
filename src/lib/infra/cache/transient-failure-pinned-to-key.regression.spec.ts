import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **the cache's default policy stored failures that said nothing
 * about the key.**
 *
 * `isRetryable`'s built-in default was `failureMode === 'RETRYABLE'`, which
 * means *everything else* was negative-cached — including an untagged
 * `SystemError`/`InfrastructureError` (they carry no failureMode at all) and,
 * once it existed, an `ABORTED` clock event. Either would pin an unrelated 5xx
 * to a perfectly valid key for the whole negative TTL, so every later caller
 * got a cached failure for an input that was never the problem.
 *
 * It was survivable only because the one live cache always passed a custom
 * policy; any second cache would have inherited the bug. The default now stores
 * only NOT_FOUND and PERMANENT — the two modes that say something durable about
 * the input. Defect D13 in docs/timeout-and-cancellation-model.md.
 */

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: { inc: vi.fn() },
  collectMetricsCacheMisses: { inc: vi.fn() },
  collectMetricsCacheErrors: { inc: vi.fn() },
  collectMetricsCachePendingFetches: { set: vi.fn() },
  collectMetricsCacheFetchDuration: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsCacheCircuitBreakerTrips: { inc: vi.fn() },
}))

import { ResilientCache } from './resilient-cache'
import { err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

/** An InfrastructureError with no failureMode — the shape that used to be cached. */
class UntaggedInfraError extends AppError {
  constructor() {
    super({ code: 'UNTAGGED', message: 'infrastructure blew up' }, ErrorType.INTERNAL_SERVER_ERROR)
  }
}

describe('regression: a transient failure must not be pinned to a key', () => {
  /** A cache with no custom policy — exactly the case the default governs. */
  function bareCache() {
    return new ResilientCache<AppError>({ get: mockRedisGet, set: mockRedisSet } as never, {
      prefix: 'regression:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 1_800,
      fetchTimeoutMs: 5_000,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue('OK')
  })

  it.each([
    ['an untagged infrastructure error', () => new UntaggedInfraError()],
    ['a database failure', () => new DatabaseQueryError(new Error('connection reset'))],
    ['a spent request budget', () => new DeadlineExceededError('DEADLINE_EXPIRED')],
  ])('does not store %s', async (_label, makeError) => {
    await bareCache().getOrFetch('key', async () => err(makeError()))

    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it.each([
    ['a genuinely absent resource (NOT_FOUND)', () => new InvalidCepError('01310100')],
    ['a deterministically unanswerable input (PERMANENT)', () => new NoNearbyChurchesFoundError()],
  ])('still stores %s', async (_label, makeError) => {
    // The counterweight: the fix must not have turned into "cache nothing", or
    // the negative cache stops shielding the upstream APIs entirely.
    await bareCache().getOrFetch('key', async () => err(makeError()))

    expect(mockRedisSet).toHaveBeenCalledOnce()
  })
})
