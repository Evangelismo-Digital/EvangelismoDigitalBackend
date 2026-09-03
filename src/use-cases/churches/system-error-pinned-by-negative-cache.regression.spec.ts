import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isRetryableChurchLookupError, makeNearestChurchesCacheOptions } from './church-lookup-cache-policy'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ResilientCache } from '@lib/infra/cache/resilient-cache'

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

/**
 * Symptom: a genuine internal fault on the nearest-churches path — a 500 such
 * as CepToLatLonError, or any infrastructure failure — was written to the cache
 * as a negative envelope and served back for the whole 30-minute negative TTL.
 * Every later request for that CEP got the cached 500 without the chain ever
 * being retried.
 *
 * Cause: ResilientCache's default isRetryable is `failureMode === 'RETRYABLE'`,
 * so any error that declares no failureMode counted as permanent and was
 * cached. SystemError and InfrastructureError declare none.
 *
 * Fails on the pre-fix code, where the nearest-churches cache options passed no
 * isRetryable at all.
 */
describe('regression: a system error must not be pinned by the negative cache', () => {
  describe('policy', () => {
    it('does not negative-cache CepToLatLonError (a SystemError surfaced as HTTP 500)', () => {
      expect(isRetryableChurchLookupError(new CepToLatLonError('01310100'))).toBe(true)
    })

    it.each([
      ['ServiceBusyError', new ServiceBusyError('LocationIQ')],
      ['TimeoutExceededError', new TimeoutExceededError('Timeout Exceeded')],
      ['ProviderFailureError', new ProviderFailureError(new Error('boom'))],
    ])('does not negative-cache %s', (_name, error) => {
      expect(isRetryableChurchLookupError(error as AppError)).toBe(true)
    })

    it.each([
      ['InvalidCepError', new InvalidCepError('01310100')],
      ['CoordinatesNotFoundError', new CoordinatesNotFoundError()],
      ['NoNearbyChurchesFoundError', new NoNearbyChurchesFoundError()],
      ['EmptyChurchListError', new EmptyChurchListError()],
    ])('still negative-caches %s, which is deterministic for the input', (_name, error) => {
      expect(isRetryableChurchLookupError(error as AppError)).toBe(false)
    })

    it.each([
      ['LatitudeRangeError', new LatitudeRangeError()],
      ['LongitudeRangeError', new LongitudeRangeError()],
    ])('does not negative-cache %s, which signals a bad upstream geocode', (_name, error) => {
      expect(isRetryableChurchLookupError(error as AppError)).toBe(true)
    })
  })

  describe('applied to the real cache', () => {
    let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      vi.clearAllMocks()
      redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }
    })

    async function runWith(error: AppError) {
      // The real options the factory wires, not a hand-built stand-in.
      const cache = new ResilientCache<AppError>(redis as never, makeNearestChurchesCacheOptions())

      return await cache.getOrFetch('cache:nearest-churches:key', async () => err(error))
    }

    it('writes no negative envelope for a 500, leaving the next request to retry the chain', async () => {
      const result = await runWith(new CepToLatLonError('01310100'))

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(CepToLatLonError)
      }
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('still writes a negative envelope for InvalidCepError, with the bad-CEP TTL', async () => {
      const result = await runWith(new InvalidCepError('01310100'))

      expect(isErr(result)).toBe(true)
      expect(redis.set).toHaveBeenCalledTimes(1)

      const [, payload, mode, ttl] = redis.set.mock.calls[0]
      expect(JSON.parse(payload as string)).toMatchObject({ s: false, e: { type: 'InvalidCepError' } })
      expect(mode).toBe('EX')
      // 24h base, +/- the 5% jitter the cache applies
      expect(ttl).toBeGreaterThanOrEqual(82_080)
      expect(ttl).toBeLessThanOrEqual(90_720)
    })

    it('still writes a success envelope on the happy path', async () => {
      // The real options the factory wires, not a hand-built stand-in.
      const cache = new ResilientCache<AppError>(redis as never, makeNearestChurchesCacheOptions())

      await cache.getOrFetch('cache:nearest-churches:key', async () => ok({ totalFound: 3 }))

      const [, payload] = redis.set.mock.calls[0]
      expect(JSON.parse(payload as string)).toMatchObject({ s: true, v: { totalFound: 3 } })
    })
  })
})
