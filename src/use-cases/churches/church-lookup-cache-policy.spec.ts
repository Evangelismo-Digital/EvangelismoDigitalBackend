import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isRetryableChurchLookupError,
  negativeTtlForChurchLookup,
  makeNearestChurchesCacheOptions,
} from './church-lookup-cache-policy'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ResilientCache } from '@lib/infra/cache/resilient-cache'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import { err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

vi.mock('@lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: { inc: vi.fn() },
  collectMetricsCacheMisses: { inc: vi.fn() },
  collectMetricsCacheErrors: { inc: vi.fn() },
  collectMetricsCachePendingFetches: { set: vi.fn() },
  collectMetricsCacheFetchDuration: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsCacheCircuitBreakerTrips: { inc: vi.fn() },
}))

const { NOT_FOUND_TTL_SECONDS, PERMANENT_TTL_SECONDS } = CACHE_CONFIG.NEAREST_CHURCHES

describe('CEP negative cache policy', () => {
  describe('negativeTtlForChurchLookup', () => {
    it.each([
      ['InvalidCepError', new InvalidCepError('01310100')],
      ['CoordinatesNotFoundError', new CoordinatesNotFoundError()],
    ])('keeps %s for the long bad-CEP TTL, shielding the address/geocoding APIs', (_name, error) => {
      expect(negativeTtlForChurchLookup(error as AppError)).toBe(NOT_FOUND_TTL_SECONDS)
    })

    it.each([
      ['NoNearbyChurchesFoundError', new NoNearbyChurchesFoundError()],
      ['EmptyChurchListError', new EmptyChurchListError()],
    ])('keeps %s only for the short TTL, since it depends on our own database', (_name, error) => {
      expect(negativeTtlForChurchLookup(error as AppError)).toBe(PERMANENT_TTL_SECONDS)
    })

    it('defaults to the short TTL for anything else — such an error is never cached anyway', () => {
      const uncacheable = new CepToLatLonError('01310100')

      expect(isRetryableChurchLookupError(uncacheable)).toBe(true)
      expect(negativeTtlForChurchLookup(uncacheable)).toBe(PERMANENT_TTL_SECONDS)
    })

    it('refuses to cache a spent request budget — ABORTED says nothing about the CEP', () => {
      const aborted = new DeadlineExceededError('DEADLINE_EXPIRED')

      // Terminal for a fallback chain, but not knowledge about the input:
      // caching it would pin a 503 to a perfectly valid CEP for 30 minutes.
      expect(aborted.failureMode).toBe('ABORTED')
      expect(isRetryableChurchLookupError(aborted)).toBe(true)
    })

    it('holds a bad CEP strictly longer than a no-church result', () => {
      expect(negativeTtlForChurchLookup(new InvalidCepError('01310100'))).toBeGreaterThan(
        negativeTtlForChurchLookup(new NoNearbyChurchesFoundError()),
      )
    })

    it('is configured to hold a bad CEP for a full day', () => {
      expect(NOT_FOUND_TTL_SECONDS).toBe(60 * 60 * 24)
    })
  })

  describe('applied to the real cache', () => {
    let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      vi.clearAllMocks()
      redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }
    })

    async function ttlWrittenFor(error: AppError): Promise<number | undefined> {
      const cache = new ResilientCache<AppError>(redis as never, makeNearestChurchesCacheOptions())
      await cache.getOrFetch('cache:nearest-churches:key', async () => err(error))

      if (redis.set.mock.calls.length === 0) {
        return undefined
      }
      return redis.set.mock.calls[0][3] as number
    }

    /** The cache applies +/-5% jitter, so assert a band rather than an exact value. */
    function expectTtlNear(actual: number | undefined, base: number) {
      expect(actual).toBeDefined()
      expect(actual).toBeGreaterThanOrEqual(Math.floor(base * 0.95) - 1)
      expect(actual).toBeLessThanOrEqual(Math.ceil(base * 1.05) + 1)
    }

    it('writes an invalid CEP with the 24h TTL', async () => {
      expectTtlNear(await ttlWrittenFor(new InvalidCepError('01310100')), NOT_FOUND_TTL_SECONDS)
    })

    it('writes an unresolvable address with the 24h TTL', async () => {
      expectTtlNear(await ttlWrittenFor(new CoordinatesNotFoundError()), NOT_FOUND_TTL_SECONDS)
    })

    it('writes a no-nearby-church result with the 30min TTL', async () => {
      expectTtlNear(await ttlWrittenFor(new NoNearbyChurchesFoundError()), PERMANENT_TTL_SECONDS)
    })

    it('writes nothing at all for a retryable infrastructure failure', async () => {
      expect(await ttlWrittenFor(new ServiceBusyError('LocationIQ'))).toBeUndefined()
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('writes nothing at all when the request budget was spent', async () => {
      expect(await ttlWrittenFor(new DeadlineExceededError('DEADLINE_EXPIRED'))).toBeUndefined()
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('serves the cached CEP failure back without re-running the fetcher', async () => {
      const cache = new ResilientCache<AppError>(redis as never, makeNearestChurchesCacheOptions())
      redis.get.mockResolvedValue(
        JSON.stringify({ s: false, e: { type: 'InvalidCepError', message: 'CEP 01310100 inválido' } }),
      )

      const fetcher = vi.fn()
      const result = await cache.getOrFetch('cache:nearest-churches:key', fetcher)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(InvalidCepError)
      }
      // The whole point: no address or geocoding provider is contacted.
      expect(fetcher).not.toHaveBeenCalled()
    })
  })
})
