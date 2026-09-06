/**
 * Integration — ResilientCache against a real Redis.
 *
 * Redis-only: no Postgres, no Prisma environment, no BullMQ/pub-sub singletons,
 * so this runs in CI (project `integration-cache`, listed in ci.yml and
 * scripts/ci-local.sh) as well as locally with the compose stack up.
 *
 * Covers what unit tests with a mocked client cannot: real TTL semantics, real
 * key expiry, real concurrency, and the behaviour of the cache when Redis
 * itself is unreachable.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import Redis from 'ioredis'
import { createRedisCacheConnection } from '@lib/redis/connections/redis-cache-connection'
import { ResilientCache, CacheEnvelope, ResilientCacheOptions } from './resilient-cache'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { serializeAppError, deserializeAppError } from 'errors/app-error-registry'
import {
  isRetryableChurchLookupError,
  negativeTtlForChurchLookup,
  makeNearestChurchesCacheOptions,
} from '@use-cases/churches/church-lookup-cache-policy'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import { Deadline } from 'core/shared/deadline'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

const PREFIX = 'cache:it:redis:'

let redis: Redis

function makeCache(overrides: Partial<ResilientCacheOptions<AppError>> = {}) {
  return new ResilientCache<AppError>(redis, {
    prefix: PREFIX,
    defaultTtlSeconds: 60,
    negativeTtlSeconds: 30,
    fetchTimeoutMs: 5_000,
    ttlJitterPercentage: 0,
    serializeError: serializeAppError,
    deserializeError: deserializeAppError,
    ...overrides,
  })
}

/** The real wiring the API uses, pointed at the integration prefix. */
function makeChurchCache() {
  return new ResilientCache<AppError>(redis, { ...makeNearestChurchesCacheOptions(), prefix: PREFIX })
}

async function flushPrefix() {
  const keys = await redis.keys(`${PREFIX}*`)
  if (keys.length) await redis.del(...keys)
}

beforeAll(async () => {
  redis = createRedisCacheConnection()
  if (redis.status !== 'ready') await new Promise<void>((r) => redis.once('ready', () => r()))
})

afterEach(async () => {
  await flushPrefix()
})

afterAll(async () => {
  await flushPrefix()
  await redis.quit()
})

describe('ResilientCache against real Redis — TTL semantics', () => {
  it('gives an invalid CEP the long bad-CEP TTL, measured on the key itself', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}ttl-invalid-cep`

    await cache.getOrFetch(key, async () => err(new InvalidCepError('99999999')))

    const ttl = await redis.ttl(key)
    const base = CACHE_CONFIG.NEAREST_CHURCHES.NOT_FOUND_TTL_SECONDS
    expect(ttl).toBeGreaterThan(base * 0.9)
    expect(ttl).toBeLessThanOrEqual(base * 1.1)
  })

  it('gives an unresolvable address the same long TTL', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}ttl-no-coords`

    await cache.getOrFetch(key, async () => err(new CoordinatesNotFoundError()))

    expect(await redis.ttl(key)).toBeGreaterThan(CACHE_CONFIG.NEAREST_CHURCHES.NOT_FOUND_TTL_SECONDS * 0.9)
  })

  it('gives a no-nearby-church result the short TTL, so a new church surfaces quickly', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}ttl-no-church`

    await cache.getOrFetch(key, async () => err(new NoNearbyChurchesFoundError()))

    const ttl = await redis.ttl(key)
    const base = CACHE_CONFIG.NEAREST_CHURCHES.PERMANENT_TTL_SECONDS
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(base * 1.1)
  })

  it('holds a bad CEP dramatically longer than a no-church result', async () => {
    const cache = makeChurchCache()
    const badCep = `${PREFIX}ttl-cmp-cep`
    const noChurch = `${PREFIX}ttl-cmp-church`

    await cache.getOrFetch(badCep, async () => err(new InvalidCepError('99999999')))
    await cache.getOrFetch(noChurch, async () => err(new NoNearbyChurchesFoundError()))

    expect(await redis.ttl(badCep)).toBeGreaterThan((await redis.ttl(noChurch)) * 10)
  })

  it('gives a success the default TTL', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}ttl-success`

    await cache.getOrFetch(key, async () => ok({ churches: [] }))

    expect(await redis.ttl(key)).toBeGreaterThan(CACHE_CONFIG.NEAREST_CHURCHES.DEFAULT_TTL_SECONDS * 0.9)
  })

  it('never persists a retryable failure, so the key has no TTL at all', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}ttl-retryable`

    await cache.getOrFetch(key, async () => err(new ServiceBusyError('LocationIQ')))

    expect(await redis.get(key)).toBeNull()
    expect(await redis.ttl(key)).toBe(-2) // -2 = key does not exist
  })

  it('refetches once the entry actually expires in Redis', async () => {
    const cache = makeCache()
    const key = `${PREFIX}expiry`
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('v'))

    await cache.getOrFetch(key, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Collapse the real TTL instead of waiting it out.
    await redis.pexpire(key, 1)
    await vi.waitFor(async () => expect(await redis.get(key)).toBeNull())

    await cache.getOrFetch(key, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('skips the write entirely when the resolved TTL is zero', async () => {
    const cache = makeCache({ negativeTtlFor: () => 0, isRetryable: () => false })
    const key = `${PREFIX}zero-ttl`

    await cache.getOrFetch(key, async () => err(new InvalidCepError('99999999')))

    expect(await redis.get(key)).toBeNull()
  })
})

describe('ResilientCache against real Redis — round-tripping the CEP negative cache', () => {
  it('replays an invalid CEP from Redis without touching the fetcher', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}replay-cep`
    const fetcher = vi.fn(async (): Promise<Result<never, AppError>> => err(new InvalidCepError('99999999')))

    await cache.getOrFetch(key, fetcher)
    const second = await cache.getOrFetch(key, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isErr(second)).toBe(true)
    if (isErr(second)) {
      expect(second.error).toBeInstanceOf(InvalidCepError)
      expect(second.error.message).toContain('99999999')
    }
  })

  it('keeps the policy and the stored envelope in agreement', async () => {
    const cache = makeChurchCache()
    const key = `${PREFIX}policy-agreement`
    const error = new InvalidCepError('99999999')

    await cache.getOrFetch(key, async () => err(error))

    const stored = JSON.parse((await redis.get(key)) as string) as CacheEnvelope<never>
    expect(stored.s).toBe(false)
    expect(stored.e?.type).toBe('InvalidCepError')
    expect(isRetryableChurchLookupError(error)).toBe(false)
    expect(await redis.ttl(key)).toBeLessThanOrEqual(negativeTtlForChurchLookup(error) * 1.1)
  })
})

describe('ResilientCache against real Redis — foreign and corrupt payloads', () => {
  it('refetches when the stored payload is not JSON', async () => {
    const cache = makeCache()
    const key = `${PREFIX}corrupt-json`
    await redis.set(key, 'definitely not json')

    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('fresh'))
    const result = await cache.getOrFetch(key, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(result) && result.value).toBe('fresh')
  })

  it('surfaces a clean provider error when a success envelope has no value', async () => {
    const cache = makeCache()
    const key = `${PREFIX}corrupt-missing-v`
    await redis.set(key, JSON.stringify({ s: true }))

    const fetcher = vi.fn()
    const result = await cache.getOrFetch(key, fetcher)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ProviderFailureError)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetches when a failure envelope carries no error payload', async () => {
    const cache = makeCache()
    const key = `${PREFIX}corrupt-missing-e`
    await redis.set(key, JSON.stringify({ s: false }))

    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('fresh'))
    const result = await cache.getOrFetch(key, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(result) && result.value).toBe('fresh')
  })

  it('reconstructs an unregistered cached error type as a sanitized infrastructure error', async () => {
    const cache = makeCache()
    const key = `${PREFIX}corrupt-unknown-type`
    await redis.set(key, JSON.stringify({ s: false, e: { type: 'NotARealError', message: 'nope' } }))

    const fetcher = vi.fn()
    const result = await cache.getOrFetch(key, fetcher)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      // The registry always yields *something*, so the cache's own
      // ProviderFailureError fallback is only reached without a deserializer.
      expect(result.error.body.code).toBe('UNKNOWN_DESERIALIZATION_ERROR')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses its own provider-error fallback when no deserializer is configured', async () => {
    const cache = new ResilientCache<AppError>(redis, {
      prefix: PREFIX,
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 5_000,
    })
    const key = `${PREFIX}corrupt-no-deserializer`
    await redis.set(key, JSON.stringify({ s: false, e: { type: 'NotARealError', message: 'nope' } }))

    const result = await cache.getOrFetch(key, vi.fn())

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ProviderFailureError)
    }
  })

  it('treats a value written by something else entirely as a miss, not a crash', async () => {
    const cache = makeCache()
    const key = `${PREFIX}foreign`
    await redis.set(key, JSON.stringify({ some: 'other app', shape: [1, 2, 3] }))

    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('fresh'))
    const result = await cache.getOrFetch(key, fetcher)

    // No `s` field -> not a success, no `e` -> fall through and refetch.
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(result) && result.value).toBe('fresh')
  })

  it('overwrites a corrupt entry with a good one on the next fetch', async () => {
    const cache = makeCache()
    const key = `${PREFIX}corrupt-overwrite`
    await redis.set(key, 'garbage')

    await cache.getOrFetch(key, async () => ok('good'))

    const envelope = JSON.parse((await redis.get(key)) as string) as CacheEnvelope<string>
    expect(envelope).toEqual({ s: true, v: 'good' })
  })
})

describe('ResilientCache against real Redis — concurrency', () => {
  it('collapses many simultaneous callers on one key into a single fetch', async () => {
    const cache = makeCache()
    const key = `${PREFIX}stampede`
    let release!: (r: Result<number, AppError>) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Result<number, AppError>>((res) => {
          release = res
        }),
    )

    const first = cache.getOrFetch(key, fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    const rest = Array.from({ length: 20 }, () => cache.getOrFetch(key, fetcher))
    release(ok(7))
    const results = await Promise.all([first, ...rest])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(21)
    for (const r of results) {
      expect(isOk(r) && r.value).toBe(7)
    }
  })

  it('does not let one key block another', async () => {
    const cache = makeCache()
    let releaseSlow!: (r: Result<string, AppError>) => void
    const slow = vi.fn(
      () =>
        new Promise<Result<string, AppError>>((res) => {
          releaseSlow = res
        }),
    )

    const blocked = cache.getOrFetch(`${PREFIX}key-a`, slow)
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1))

    const other = await cache.getOrFetch(`${PREFIX}key-b`, async () => ok('independent'))
    expect(isOk(other) && other.value).toBe('independent')

    releaseSlow(ok('a'))
    await blocked
  })

  it('frees the in-flight slot so a later call re-reads Redis and hits', async () => {
    const cache = makeCache()
    const key = `${PREFIX}slot-release`
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('v'))

    await cache.getOrFetch(key, fetcher)
    await cache.getOrFetch(key, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await redis.get(key)).not.toBeNull()
  })

  it('trips the circuit breaker at MAX_PENDING, then recovers once a slot frees', async () => {
    const cache = makeCache({ maxPendingFetches: 1 })
    let release!: () => void
    const slow = vi.fn(
      () =>
        new Promise<Result<number, AppError>>((res) => {
          release = () => res(ok(1))
        }),
    )

    const inflight = cache.getOrFetch(`${PREFIX}cb-1`, slow)
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1))

    const rejected = await cache.getOrFetch(`${PREFIX}cb-2`, vi.fn())
    expect(isErr(rejected)).toBe(true)
    if (isErr(rejected)) expect(rejected.error.body.code).toBe('SERVICE_OVERLOAD')

    release()
    await inflight

    // Slot freed — the next caller is served normally.
    const recovered = await cache.getOrFetch(`${PREFIX}cb-3`, async () => ok(2))
    expect(isOk(recovered) && recovered.value).toBe(2)
  })

  it('deduplicates per process only — a second instance runs its own fetch', async () => {
    // Documents a real limitation: pendingFetches is an in-memory Map, so two
    // API pods will each hit the providers once for the same cold key. Redis
    // is the only cross-process guard, and only after the first write lands.
    const key = `${PREFIX}cross-instance`
    const cacheA = makeCache()
    const cacheB = makeCache()

    let release!: (r: Result<string, AppError>) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Result<string, AppError>>((res) => {
          release = res
        }),
    )

    const a = cacheA.getOrFetch(key, fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const b = cacheB.getOrFetch(key, fetcher)

    release(ok('v'))
    await Promise.all([a, b])

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('ResilientCache against real Redis — signal handling', () => {
  it('persists a value produced after the caller aborted, so the next caller gets a hit', async () => {
    const cache = makeCache()
    const key = `${PREFIX}post-abort`
    const controller = new AbortController()

    const result = await cache.getOrFetch(
      key,
      () => {
        const settled = Promise.resolve(ok('computed after abort'))
        controller.abort('caller gave up')
        return settled
      },
      Deadline.in(Infinity, { linkedTo: controller.signal }),
    )

    // Behaviour change (D11), proven against real Redis: the caller who walked
    // away still gets its own DeadlineExceededError, but the answer it paid for
    // is kept rather than thrown away and recomputed by the next request.
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
    }

    await vi.waitFor(async () => expect(await redis.get(key)).not.toBeNull())
    expect(JSON.parse((await redis.get(key)) as string)).toMatchObject({ s: true, v: 'computed after abort' })
  })

  it('fails fast on an already-aborted signal without reading or writing Redis', async () => {
    const cache = makeCache()
    const key = `${PREFIX}pre-abort`
    const controller = new AbortController()
    controller.abort('gone')

    const fetcher = vi.fn()
    const result = await cache.getOrFetch(key, fetcher, Deadline.in(Infinity, { linkedTo: controller.signal }))

    expect(isErr(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await redis.get(key)).toBeNull()
  })

  it('does not cache a timeout, so the next call retries against Redis', async () => {
    const cache = makeCache({ fetchTimeoutMs: 20 })
    const key = `${PREFIX}timeout`

    const stalled = await cache.getOrFetch(key, () => new Promise<Result<string, AppError>>(() => {}))
    expect(isErr(stalled)).toBe(true)
    expect(await redis.get(key)).toBeNull()

    const recovered = await cache.getOrFetch(key, async () => ok('later'))
    expect(isOk(recovered) && recovered.value).toBe('later')
  })
})

describe('ResilientCache against real Redis — outage behaviour', () => {
  let broken: Redis

  afterEach(() => {
    broken?.disconnect()
  })

  function makeBrokenCache() {
    // Nothing listens on this port: every command fails.
    broken = new Redis({
      host: '127.0.0.1',
      port: 6390,
      commandTimeout: 200,
      connectTimeout: 200,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
    broken.on('error', () => {
      /* expected: the point of the test */
    })

    return new ResilientCache<AppError>(broken, {
      prefix: PREFIX,
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 5_000,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError,
    })
  }

  it('serves from the fetcher when Redis is unreachable, instead of throwing', async () => {
    const cache = makeBrokenCache()
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('from origin'))

    const result = await cache.getOrFetch(`${PREFIX}outage-read`, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe('from origin')
  })

  it('still returns the fetcher error when Redis is unreachable', async () => {
    const cache = makeBrokenCache()

    const result = await cache.getOrFetch(`${PREFIX}outage-write`, async () => err(new InvalidCepError('99999999')))

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(InvalidCepError)
  })

  it('recovers transparently once Redis is reachable again', async () => {
    const brokenCache = makeBrokenCache()
    const key = `${PREFIX}outage-recovery`

    await brokenCache.getOrFetch(key, async () => ok('during outage'))

    // A healthy client over the same keyspace caches normally again.
    const healthy = makeCache()
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('after recovery'))

    await healthy.getOrFetch(key, fetcher)
    const second = await healthy.getOrFetch(key, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(second) && second.value).toBe('after recovery')
  })

  it('degrades to no dedup benefit but still answers every caller during an outage', async () => {
    const cache = makeBrokenCache()
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('v'))

    const results = await Promise.all([
      cache.getOrFetch(`${PREFIX}outage-a`, fetcher),
      cache.getOrFetch(`${PREFIX}outage-b`, fetcher),
    ])

    for (const r of results) {
      expect(isOk(r)).toBe(true)
    }
  })
})
