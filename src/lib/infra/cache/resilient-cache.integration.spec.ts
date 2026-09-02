/**
 * Integration — ResilientCache against a real Redis (docker-compose).
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Redis } from 'ioredis'
import { createRedisCacheConnection } from '@lib/redis/connections/redis-cache-connection'
import { ResilientCache, CacheEnvelope, ResilientCacheOptions } from './resilient-cache'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { serializeAppError, deserializeAppError } from 'errors/app-error-registry'

const PREFIX = 'cache:it:resilient:'

let redis: Redis

function makeCache(overrides: Partial<ResilientCacheOptions<AppError>> = {}) {
  return new ResilientCache<AppError>(redis, {
    prefix: PREFIX,
    defaultTtlSeconds: 60,
    negativeTtlSeconds: 30,
    serializeError: serializeAppError,
    deserializeError: deserializeAppError,
    ...overrides,
  })
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

describe('ResilientCache (integration, real Redis)', () => {
  it('MISS → runs the fetcher once, then stores a success envelope readable back from Redis', async () => {
    const cache = makeCache()
    const key = `${PREFIX}hit-path`
    const fetcher = vi.fn(async (): Promise<Result<{ n: number }, AppError>> => ok({ n: 42 }))

    const first = await cache.getOrFetch(key, fetcher)

    expect(isOk(first)).toBe(true)
    if (isOk(first)) expect(first.value).toEqual({ n: 42 })
    expect(fetcher).toHaveBeenCalledTimes(1)

    const raw = await redis.get(key)
    expect(raw).not.toBeNull()
    const envelope = JSON.parse(raw as string) as CacheEnvelope<{ n: number }>
    expect(envelope.s).toBe(true)
    expect(envelope.v).toEqual({ n: 42 })
    expect(await redis.ttl(key)).toBeGreaterThan(0)
  })

  it('HIT → second call is served from Redis without invoking the fetcher again', async () => {
    const cache = makeCache()
    const key = `${PREFIX}served-from-redis`
    const fetcher = vi.fn(async (): Promise<Result<string, AppError>> => ok('value'))

    await cache.getOrFetch(key, fetcher)
    const second = await cache.getOrFetch(key, fetcher)

    expect(isOk(second)).toBe(true)
    if (isOk(second)) expect(second.value).toBe('value')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('in-flight dedup → a caller arriving during a fetch shares it instead of re-fetching', async () => {
    const cache = makeCache()
    const key = `${PREFIX}dedup`
    let resolveFetch!: (r: Result<number, AppError>) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Result<number, AppError>>((res) => {
          resolveFetch = res
        }),
    )

    const p1 = cache.getOrFetch(key, fetcher)
    // Wait until the first fetch is actually in flight (past the Redis read).
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    const p2 = cache.getOrFetch(key, fetcher)
    resolveFetch(ok(7))
    const [r1, r2] = await Promise.all([p1, p2])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(isOk(r1) && isOk(r2)).toBe(true)
    if (isOk(r1)) expect(r1.value).toBe(7)
    if (isOk(r2)) expect(r2.value).toBe(7)
  })

  it('negative caching → a non-retryable failure is persisted and replayed via deserializeError', async () => {
    const cache = makeCache()
    const key = `${PREFIX}negative`
    const fetcher = vi.fn(async (): Promise<Result<never, AppError>> => err(new InvalidCepError('99999999')))

    const first = await cache.getOrFetch(key, fetcher)
    expect(isErr(first)).toBe(true)

    const stored = await redis.get(key)
    const envelope = JSON.parse(stored as string) as CacheEnvelope<never>
    expect(envelope.s).toBe(false)
    expect(envelope.e?.type).toBe('InvalidCepError')

    const second = await cache.getOrFetch(key, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1) // replayed from cache
    expect(isErr(second)).toBe(true)
    if (isErr(second)) {
      expect(second.error).toBeInstanceOf(InvalidCepError)
      expect((second.error as AppError).message).toContain('99999999')
    }
  })

  it('RETRYABLE failures are NOT cached (transient) → the fetcher runs again next time', async () => {
    const cache = makeCache()
    const key = `${PREFIX}retryable`
    const fetcher = vi.fn(async (): Promise<Result<never, AppError>> => err(new ServiceBusyError('ViaCEP')))

    await cache.getOrFetch(key, fetcher)
    expect(await redis.get(key)).toBeNull()

    await cache.getOrFetch(key, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('circuit breaker → returns ServiceOverload once MAX_PENDING in-flight fetches is reached', async () => {
    const cache = makeCache({ maxPendingFetches: 1 })
    let release!: () => void
    const slow = vi.fn(
      () =>
        new Promise<Result<number, AppError>>((res) => {
          release = () => res(ok(1))
        }),
    )

    const inflight = cache.getOrFetch(`${PREFIX}slot-1`, slow)
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1)) // slot occupied

    const secondFetcher = vi.fn()
    const rejected = await cache.getOrFetch(`${PREFIX}slot-2`, secondFetcher)

    expect(isErr(rejected)).toBe(true)
    if (isErr(rejected)) expect((rejected.error as AppError).body.code).toBe('SERVICE_OVERLOAD')
    expect(secondFetcher).not.toHaveBeenCalled()

    release()
    await inflight
  })

  it('generateKey is deterministic and order-insensitive, and prefixes the hash', () => {
    const cache = makeCache()
    const a = cache.generateKey({ cep: '01310100', country: 'BR' })
    const b = cache.generateKey({ country: 'BR', cep: '01310100' })
    expect(a).toBe(b)
    expect(a.startsWith(PREFIX)).toBe(true)
  })
})
