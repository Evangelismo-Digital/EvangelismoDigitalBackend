import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Regression: **a request could run far past the budget the client waits on.**
 *
 * Before the deadline model there was one clock, inside the cache, and nothing
 * above or below it derived from that clock. The Redis read ran before it
 * started and the write after it stopped, each bounded only by ioredis'
 * 1s `commandTimeout`; the provider chains invented their own per-attempt
 * timeouts and backoff sleeps on top. The nominal worst case inside the
 * address + geocoding legs alone was ~25.8s under a 15s ceiling, and the real
 * ceiling for a synchronous client-facing GET was ~17s.
 *
 * The whole point of the refactor is the single guarantee asserted here: **the
 * call returns within the budget it was given, whatever the layers below do.**
 *
 * Defects D1, D3 and D5 in docs/timeout-and-cancellation-model.md.
 */

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

import { FindNearestChurchesUseCase } from './find-nearest-churches-use-case'
import { CepToLatLonUseCase } from './cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import { makeNearestChurchesCacheOptions } from './church-lookup-cache-policy'
import { Deadline } from 'core/shared/deadline'
import { isErr } from 'core/shared/result'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { HTTP_DEADLINE_POLICIES } from '@http/policies/deadline'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'

/** Redis that never answers — the degraded-cache case the old design ignored. */
const hangingRedis = { get: () => new Promise(() => {}), set: () => new Promise(() => {}) }

/** A collaborator that never returns, standing in for a wedged upstream. */
function neverReturns() {
  return vi.fn(() => new Promise(() => {}))
}

function makeUseCase(redis: { get: unknown; set: unknown }) {
  const cepToLatLon = { execute: neverReturns() } as unknown as CepToLatLonUseCase
  const knn = { execute: neverReturns() } as unknown as FindNearbyChurchesKnnUseCase
  const routing = { findNearest: neverReturns() } as unknown as CalculateChurchRouteDistancesUseCase

  return new FindNearestChurchesUseCase(cepToLatLon, knn, routing, {
    redis: redis as never,
    options: makeNearestChurchesCacheOptions(),
  })
}

describe('regression: a request must not outlive the budget it was given', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns within the budget even when every layer below hangs forever', async () => {
    const useCase = makeUseCase(hangingRedis)

    const pending = useCase.execute({ cep: '01310100', deadline: Deadline.in(1_000) })
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await pending

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
    }
  })

  it('does not wait for a wedged Redis read on top of the budget', async () => {
    // The read used to sit outside the clock entirely, adding its own timeout.
    const useCase = makeUseCase(hangingRedis)

    const pending = useCase.execute({ cep: '01310100', deadline: Deadline.in(500) })
    await vi.advanceTimersByTimeAsync(500)

    expect(isErr(await pending)).toBe(true)
  })

  it('honours a caller that disconnects long before the budget would elapse', async () => {
    const client = new AbortController()
    const useCase = makeUseCase(hangingRedis)

    const pending = useCase.execute({
      cep: '01310100',
      deadline: Deadline.in(HTTP_DEADLINE_POLICIES.churches.nearest, { linkedTo: client.signal }),
    })

    await vi.advanceTimersByTimeAsync(10)
    client.abort('client desconectou')
    const result = await pending

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      // Not a timeout — nobody was left to time out for.
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
      expect((result.error as DeadlineExceededError).originalError).toBe('client desconectou')
    }
  })

  describe('the configured ladder', () => {
    it('keeps the shared fetch cap inside the route budget', () => {
      // If the cache could outlast the route, a waiting caller would see its own
      // timeout instead of the answer the fetch was about to produce.
      expect(CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS).toBeLessThan(HTTP_DEADLINE_POLICIES.churches.nearest)
    })

    it('keeps a single Redis round-trip well inside the fetch cap', () => {
      expect(CACHE_CONFIG.REDIS_OP_BUDGET_MS).toBeLessThan(CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS)
    })

    it('keeps the route budget short enough for a synchronous client-facing GET', () => {
      // It was effectively ~17s; anything near that is past any sane client.
      expect(HTTP_DEADLINE_POLICIES.churches.nearest).toBeLessThanOrEqual(10_000)
    })
  })
})
