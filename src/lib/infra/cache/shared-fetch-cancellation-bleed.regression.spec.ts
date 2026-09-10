import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Regression: **one caller's cancellation killed everybody else's fetch.**
 *
 * `pendingFetches` stored a promise bound to whichever caller arrived first, so
 * that caller's AbortSignal governed the shared work. When they disconnected,
 * every other caller waiting on the same key received their timeout error — and
 * a later arrival could not cancel its own wait at all.
 *
 * The fix gives the shared fetch a deadline of its own, detached from every
 * caller, and has each caller race only its own budget. Defect D4 in
 * docs/timeout-and-cancellation-model.md.
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
import { Deadline } from 'core/shared/deadline'
import { Result, ok, isOk, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

/**
 * Lets every parked caller advance to its next await point.
 *
 * Deterministic on purpose: `vi.waitFor` polls on real timers, which under load
 * can lose the race against the cache's own Redis-read budget and fail the test
 * for reasons that have nothing to do with deduplication.
 */
async function drainMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

describe('regression: a caller leaving must not cancel the shared fetch', () => {
  let cache: ResilientCache<AppError>

  beforeEach(() => {
    /**
     * FAKE TIMERS, and only the two primitives `Deadline` actually uses.
     *
     * Every caller below is given `Deadline.in(30_000)` — a REAL thirty-second
     * budget until this was added. Nothing in these tests wants that clock to
     * advance; the budget exists only so the caller has one. But `ci:local`
     * runs every project in parallel, and a worker starved for thirty seconds
     * let a patient caller's deadline expire, failing
     * `expect(isOk(secondResult)).toBe(true)` for reasons that have nothing to
     * do with cancellation bleed. Observed once in CI, not reproducible in
     * isolation or across two further full-load runs — the worst shape of
     * failure to diagnose from a red pipeline.
     *
     * CLAUDE.md states the rule this violated: a test that waits on a real
     * timer fails under load rather than on logic. With the clock frozen the
     * budget cannot expire by accident, and the one test that *wants* time to
     * pass advances it explicitly.
     *
     * `toFake` is narrowed deliberately: `Deadline` uses `setTimeout` and
     * `Date`, nothing else, and faking primitives the code never calls only
     * creates new ways for a test to hang.
     */
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue('OK')
    cache = new ResilientCache<AppError>({ get: mockRedisGet, set: mockRedisSet } as never, {
      prefix: 'regression:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 30_000,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function suspendedFetcher() {
    let release: (value: Result<string, AppError>) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<Result<string, AppError>>((resolve) => {
          release = resolve
        }),
    )
    return { fetcher, release: (value: Result<string, AppError>) => release(value) }
  }

  it('serves the second caller after the first one disconnects', async () => {
    const { fetcher, release } = suspendedFetcher()
    const firstCaller = new AbortController()

    const first = cache.getOrFetch('key', fetcher, Deadline.in(Infinity, { linkedTo: firstCaller.signal }))
    await drainMicrotasks()
    expect(fetcher).toHaveBeenCalledOnce()

    const second = cache.getOrFetch('key', fetcher, Deadline.in(30_000))

    firstCaller.abort('first caller disconnected')
    release(ok('the answer'))

    const [firstResult, secondResult] = await Promise.all([first, second])

    // The one who left gets their own error...
    expect(isErr(firstResult)).toBe(true)
    if (isErr(firstResult)) {
      expect(firstResult.error).toBeInstanceOf(DeadlineExceededError)
    }

    // ...and everyone else is untouched by it. This is the whole defect.
    expect(isOk(secondResult)).toBe(true)
    if (isOk(secondResult)) {
      expect(secondResult.value).toBe('the answer')
    }
  })

  it('runs the fetcher exactly once even when the first caller abandons it', async () => {
    const { fetcher, release } = suspendedFetcher()
    const firstCaller = new AbortController()

    const first = cache.getOrFetch('key', fetcher, Deadline.in(Infinity, { linkedTo: firstCaller.signal }))
    await drainMicrotasks()
    expect(fetcher).toHaveBeenCalledOnce()

    firstCaller.abort('gone')
    await first

    // The entry must survive the departure, or this starts a duplicate call
    // against the same upstream.
    const later = cache.getOrFetch('key', fetcher, Deadline.in(30_000))
    release(ok('the answer'))

    expect(isOk(await later)).toBe(true)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  /**
   * COUNTERWEIGHT to freezing the clock.
   *
   * Stopping time is a blunt instrument: it would equally hide a deadline that
   * had stopped working altogether, and every assertion above would still pass.
   * This one advances the clock past the budget on purpose and requires the
   * caller to give up — so the tests above prove "the budget does not expire by
   * accident" rather than "the budget does not exist".
   */
  it('still expires a caller whose budget genuinely runs out', async () => {
    const { fetcher } = suspendedFetcher()

    const impatient = cache.getOrFetch('key', fetcher, Deadline.in(30_000))
    await drainMicrotasks()

    await vi.advanceTimersByTimeAsync(31_000)

    const result = await impatient
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
    }
  })

  it('never lets a caller inherit a budget it did not ask for', async () => {
    const { fetcher, release } = suspendedFetcher()
    const impatient = new AbortController()

    const impatientCall = cache.getOrFetch('key', fetcher, Deadline.in(Infinity, { linkedTo: impatient.signal }))
    await drainMicrotasks()
    expect(fetcher).toHaveBeenCalledOnce()

    const patient = cache.getOrFetch('key', fetcher, Deadline.in(30_000))

    impatient.abort('cannot wait')
    expect(isErr(await impatientCall)).toBe(true)

    // The patient caller still has budget, so the work continues for them.
    release(ok('worth waiting for'))
    expect(isOk(await patient)).toBe(true)
  })
})
