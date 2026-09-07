// src/lib/redis/helper/resilient-cache.spec.ts

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

// 1. Mock environment variables FIRST
vi.mock('@lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'http://localhost',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    APP_NAME: 'Test',
    APP_PORT: 3000,
    JWT_SECRET: 'x'.repeat(60),
    FRONTEND_URL: 'http://localhost:5173',
    HASH_SALT_ROUNDS: 12,
    SMTP_EMAIL: 'test@example.com',
    SMTP_PASSWORD: 'test',
    SMTP_PORT: 465,
    SMTP_HOST: 'smtp.test.com',
    SMTP_SECURE: true,
    ADMIN_EMAIL: 'admin@example.com',
    AWESOME_API_URL: 'http://awesomeapi.test',
    AWESOME_API_TOKEN: 'token',
    VIACEP_API_URL: 'http://viacep.test',
    NOMINATIM_API_URL: 'http://nominatim.test',
    LOCATION_IQ_API_URL: 'http://locationiq.test',
    LOCATION_IQ_API_TOKEN: 'token',
    SENTRY_DSN: '',
  },
}))

// 2. Mock logger
vi.mock('@lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// 3. Mock Prometheus collectors so the observability contracts are assertable
vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: { inc: vi.fn() },
  collectMetricsCacheMisses: { inc: vi.fn() },
  collectMetricsCacheErrors: { inc: vi.fn() },
  collectMetricsCachePendingFetches: { set: vi.fn() },
  collectMetricsCacheFetchDuration: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsCacheCircuitBreakerTrips: { inc: vi.fn() },
}))

// 4. Mock IORedis
const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
      quit: vi.fn().mockResolvedValue('OK'),
    }
  })

  return {
    default: RedisMock,
    Redis: RedisMock,
  }
})

// // Imports reais
import Redis from 'ioredis'
import { ResilientCache } from './resilient-cache'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { Result, ok, err, isOk, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { AppErrorRegistry } from 'errors/app-error-registry'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { logger } from '@lib/logger'
import { Deadline } from 'core/shared/deadline'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import {
  collectMetricsCacheHits,
  collectMetricsCacheMisses,
  collectMetricsCacheErrors,
  collectMetricsCachePendingFetches,
  collectMetricsCacheFetchDuration,
  collectMetricsCacheCircuitBreakerTrips,
} from '@lib/metrics/cache-metrics'

class TestAppError extends AppError {
  constructor(failureMode: FailureMode = FailureMode.NOT_FOUND) {
    super({ code: 'TEST', message: 'Test error' }, 'INTERNAL_SERVER_ERROR' as any, failureMode)
  }
}

// Register TestAppError in registry for deserialization tests
AppErrorRegistry.TestAppError = () => new TestAppError()

describe('ResilientCache Unit Tests', () => {
  let redisClient: Redis
  let resilientCache: ResilientCache<AppError | null>

  const defaultOptions = {
    prefix: 'test-cache:',
    defaultTtlSeconds: 60,
    negativeTtlSeconds: 10,
    fetchTimeoutMs: 100,
    maxPendingFetches: 5,
    ttlJitterPercentage: 0.1,
    serializeError: (err: AppError | null) => ({
      type: err?.constructor?.name || 'Error',
      message: err?.message || '',
      data: (err as { data?: unknown })?.data || err,
    }),
    deserializeError: (type: string, message: string, data?: unknown) => {
      const factory = AppErrorRegistry[type]
      return factory
        ? factory(
            message,
            data as {
              body?: {
                provider?: string
              }
              originalError?: unknown
            },
          )
        : null
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    redisClient = new Redis()
    resilientCache = new ResilientCache<AppError | null>(redisClient, defaultOptions)
  })

  // === 1. generateKey ===
  describe('generateKey', () => {
    it('should generate a consistent SHA-256 hash for given params', () => {
      const params = { foo: 'bar', id: 123 }
      const key1 = resilientCache.generateKey(params)
      const key2 = resilientCache.generateKey(params)

      expect(key1).toBe(key2)
      expect(key1).toMatch(/^test-cache:[a-f0-9]{64}$/)
    })

    it('should ignore undefined/null/empty values but respect 0 and false', () => {
      const p1 = { a: '1', b: null }
      expect(resilientCache.generateKey(p1)).toBeDefined()
    })
  })

  // === 2. executeFetch ===
  describe('executeFetch', () => {
    const executeFetch = (key: string, fetcher: any) =>
      (resilientCache as any).executeFetch(key, fetcher, Deadline.in(5_000))

    it('should resolve value when fetcher succeeds', async () => {
      const mockFetcher = vi.fn().mockResolvedValue(ok('success'))
      const result = await executeFetch('key', mockFetcher)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value).toBe('success')
      }
    })

    it('should return error Result if fetcher fails returning error Result', async () => {
      const error = new TestAppError()
      const mockFetcher = vi.fn().mockResolvedValue(err(error))
      const result = await executeFetch('key', mockFetcher)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(error)
      }
    })
  })

  // === 3. getOrFetch (Cenários Principais) ===
  describe('getOrFetch', () => {
    it('should return cached value immediately on CACHE HIT (Success)', async () => {
      const keyParams = { id: 'test-1' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true, v: 'cached-value' }))

      const fetcher = vi.fn()
      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(mockRedisGet).toHaveBeenCalledWith(generatedKey)
      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toBe('cached-value')
      }
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('should return err(MappedError) on CACHE HIT (Negative Cache)', async () => {
      const keyParams = { id: 'test-2' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(
        JSON.stringify({
          s: false,
          e: { type: 'TestAppError', message: 'Cached Error' },
        }),
      )

      const fetcher = vi.fn()

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(fetcher).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TestAppError)
      }
    })

    it('should return err(Fallback) on CACHE HIT (Negative Cache - Unmapped Type)', async () => {
      const keyParams = { id: 'test-2-unmapped' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(
        JSON.stringify({
          s: false,
          e: { type: 'UnknownType', message: 'Cached Error' },
        }),
      )

      const fetcher = vi.fn()

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(fetcher).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should execute fetcher on CACHE MISS and cache success', async () => {
      const keyParams = { id: 'test-3' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      const fetcher = vi.fn().mockResolvedValue(ok('fresh-data'))

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toBe('fresh-data')
      }
      expect(fetcher).toHaveBeenCalled()
      expect(mockRedisSet).toHaveBeenCalledWith(
        generatedKey,
        expect.stringContaining('"s":true'),
        'EX',
        expect.any(Number),
      )
    })

    it('should coalesce concurrent requests for the SAME KEY (Single Flight)', async () => {
      const keyParams = { id: 'test-4' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(null)

      const fetcher = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return ok('shared-data')
      })

      // 50ms of sleep inside the shared 100ms budget leaves no margin on a
      // loaded machine: the budget expires, both callers get ABORTED, and a
      // test about *deduplication* fails over timing instead.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })

      const p1 = cache.getOrFetch(generatedKey, fetcher)
      const p2 = cache.getOrFetch(generatedKey, fetcher)

      const [res1, res2] = await Promise.all([p1, p2])

      expect(isOk(res1)).toBe(true)
      expect(isOk(res2)).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('should return err(InfraServiceOverloadError) when max pending fetches exceeded with DIFFERENT KEYS', async () => {
      const restrictedCache = new ResilientCache(redisClient, {
        ...defaultOptions,
        maxPendingFetches: 2,
        fetchTimeoutMs: 5000,
      })

      mockRedisGet.mockResolvedValue(null)

      const fetcher = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return ok('data')
      }

      // 1. Dispara as duas primeiras requisições para encher o limite
      const p1 = restrictedCache.getOrFetch('key-1', fetcher)
      const p2 = restrictedCache.getOrFetch('key-2', fetcher)

      // 2. Aguarda um ciclo do event loop
      await new Promise((resolve) => setTimeout(resolve, 10))

      // 3. A terceira chamada agora deve encontrar o mapa cheio e falhar
      const p3 = await restrictedCache.getOrFetch('key-3', fetcher)
      expect(isErr(p3)).toBe(true)
      if (isErr(p3)) {
        expect(p3.error).toBeInstanceOf(InfraServiceOverloadError)
      }

      // Limpeza: aguarda as promises originais finalizarem
      await Promise.allSettled([p1, p2])
    })

    it('should reject and clean up pendingFetches when fetcher hangs indefinitely', async () => {
      const keyParams = { id: 'non-cooperative-test' }
      const generatedKey = resilientCache.generateKey(keyParams)
      mockRedisGet.mockResolvedValue(null)

      // Fetcher that never resolves — simulates a library bug
      const fetcher = vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* never settles */
          }),
      )

      const pendingMap = (resilientCache as any).pendingFetches
      expect(pendingMap.size).toBe(0)

      const resultPromise = resilientCache.getOrFetch(generatedKey, fetcher)

      // Wait for event loop cycle so the Redis get resolves and sets the pending fetch
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(pendingMap.has(generatedKey)).toBe(true)

      const result = await resultPromise

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      // The key MUST be removed — this proves the memory leak is prevented
      expect(pendingMap.has(generatedKey)).toBe(false)
      expect(pendingMap.size).toBe(0)
    })
  })

  describe('Negative Caching Logic', () => {
    it('should cache failure using negative TTL when AppError is returned with NOT_FOUND', async () => {
      // 1. Configuração
      const keyParams = { id: 'negative-test-1' }
      const generatedKey = resilientCache.generateKey(keyParams)

      mockRedisGet.mockResolvedValue(null)

      const appError = new TestAppError(FailureMode.NOT_FOUND)
      const fetcher = vi.fn().mockResolvedValue(err(appError))

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isErr(result)).toBe(true)
      expect(fetcher).toHaveBeenCalled()

      // Verifica se salvou no Redis com flag de erro (s: false)
      expect(mockRedisSet).toHaveBeenCalledWith(
        generatedKey,
        expect.stringContaining('"s":false'),
        'EX',
        expect.any(Number),
      )

      // Verifica conteúdo do erro salvo
      expect(mockRedisSet).toHaveBeenCalledWith(
        generatedKey,
        expect.stringContaining('"type":"TestAppError"'),
        'EX',
        expect.any(Number),
      )

      // 6. Verifica se usou o TTL Negativo (10s) e não o Default (60s)
      const ttlArg = mockRedisSet.mock.calls[0][3]
      expect(ttlArg).toBeGreaterThanOrEqual(9)
      expect(ttlArg).toBeLessThanOrEqual(11)
      expect(ttlArg).not.toBeGreaterThanOrEqual(50) // Garante que não usou o default
    })

    it('should NOT cache failure when AppError is returned with other failure mode (Retryable)', async () => {
      const keyParams = { id: 'negative-test-2' }
      const generatedKey = resilientCache.generateKey(keyParams)
      mockRedisGet.mockResolvedValue(null)

      const appError = new TestAppError(FailureMode.RETRYABLE)
      const fetcher = vi.fn().mockResolvedValue(err(appError))

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isErr(result)).toBe(true)
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('should NOT cache failure and return TimeoutExceededError when fetch times out', async () => {
      const keyParams = { id: 'negative-test-3' }
      const generatedKey = resilientCache.generateKey(keyParams)
      mockRedisGet.mockResolvedValue(null)

      // Fetcher simulates timeout
      const fetcher = vi.fn().mockImplementation(async (deadline: Deadline) => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        if (deadline.expired) {
          return err(new TimeoutExceededError())
        }
        return ok('done')
      })

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('should NOT cache failure and return ProviderFailureError when fetch throws generic Error', async () => {
      const keyParams = { id: 'negative-test-4' }
      const generatedKey = resilientCache.generateKey(keyParams)
      mockRedisGet.mockResolvedValue(null)

      const fetcher = vi.fn().mockRejectedValue(new Error('Random JS Error'))

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
      expect(mockRedisSet).not.toHaveBeenCalled()
    })
  })

  describe('generateKey (stable hashing)', () => {
    it('is insensitive to key order, so equivalent params share one cache entry', () => {
      const a = resilientCache.generateKey({ cep: '01310100', profile: 'pedestrian' })
      const b = resilientCache.generateKey({ profile: 'pedestrian', cep: '01310100' })
      expect(a).toBe(b)
    })

    it('distinguishes different values', () => {
      const a = resilientCache.generateKey({ cep: '01310100' })
      const b = resilientCache.generateKey({ cep: '01310101' })
      expect(a).not.toBe(b)
    })

    it('distinguishes a second param from the same single param', () => {
      const single = resilientCache.generateKey({ cep: '01310100' })
      const withProfile = resilientCache.generateKey({ cep: '01310100', profile: 'bicycle' })
      expect(withProfile).not.toBe(single)
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
    ])('ignores a param that is %s, treating it as absent', (_name, value) => {
      const withEmpty = resilientCache.generateKey({ cep: '01310100', profile: value })
      const without = resilientCache.generateKey({ cep: '01310100' })
      expect(withEmpty).toBe(without)
    })

    it('does not ignore falsy-but-meaningful values like 0 and false', () => {
      const base = resilientCache.generateKey({ cep: '01310100' })
      expect(resilientCache.generateKey({ cep: '01310100', radius: 0 })).not.toBe(base)
      expect(resilientCache.generateKey({ cep: '01310100', exact: false })).not.toBe(base)
    })

    it('prefixes the key so entries are namespaced per cache', () => {
      expect(resilientCache.generateKey({ cep: '01310100' })).toMatch(/^test-cache:[0-9a-f]{64}$/)
    })
  })

  describe('negative TTL resolution', () => {
    async function ttlFor(cache: ResilientCache<AppError | null>, error: AppError) {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      await cache.getOrFetch('k', async () => err(error))
      return mockRedisSet.mock.calls.at(-1)?.[3] as number
    }

    it('uses negativeTtlFor when supplied, overriding negativeTtlSeconds', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 0,
        negativeTtlSeconds: 10,
        fetchTimeoutMs: 5_000,
        negativeTtlFor: () => 4242,
      })

      expect(await ttlFor(cache, new TestAppError())).toBe(4242)
    })

    it('falls back to negativeTtlSeconds when negativeTtlFor is absent', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 0,
        negativeTtlSeconds: 77,
        fetchTimeoutMs: 5_000,
      })

      expect(await ttlFor(cache, new TestAppError())).toBe(77)
    })

    it('skips the write entirely when the resolved TTL is zero', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        negativeTtlFor: () => 0,
      })

      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      await cache.getOrFetch('k', async () => err(new TestAppError()))

      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('applies the success TTL, not a negative one, on the happy path', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 0,
        defaultTtlSeconds: 123,
        negativeTtlFor: () => 4242,
      })

      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      await cache.getOrFetch('k', async () => ok({ any: 'value' }))

      expect(mockRedisSet.mock.calls.at(-1)?.[3]).toBe(123)
    })

    it('keeps the jittered TTL within the configured percentage band', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 0.1,
        negativeTtlFor: () => 1000,
      })

      for (let i = 0; i < 25; i++) {
        const ttl = await ttlFor(cache, new TestAppError())
        expect(ttl).toBeGreaterThanOrEqual(900)
        expect(ttl).toBeLessThanOrEqual(1100)
      }
    })

    it('never writes a non-positive TTL even when jitter would push it below one', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 2,
        negativeTtlFor: () => 1,
      })

      for (let i = 0; i < 25; i++) {
        expect(await ttlFor(cache, new TestAppError())).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('option defaults', () => {
    const bareOptions = { prefix: 'bare:', defaultTtlSeconds: 60, negativeTtlSeconds: 30, fetchTimeoutMs: 5_000 }

    it('serializes an error by constructor name when no serializeError is given', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err(new TestAppError()))

      const payload = JSON.parse(mockRedisSet.mock.calls.at(-1)?.[1] as string)
      expect(payload).toMatchObject({ s: false, e: { type: 'TestAppError', message: 'Test error' } })
    })

    it('treats a RETRYABLE error as uncacheable when no isRetryable is given', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      await cache.getOrFetch('k', async () => err(new TestAppError(FailureMode.RETRYABLE)))

      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('does not cache an ABORTED error by default — a spent clock says nothing about the key', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      await cache.getOrFetch('k', async () => err(new TestAppError(FailureMode.ABORTED)))

      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('does not cache an untagged error by default — a SystemError is about us, not the input', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      // A genuinely untagged error — exactly the shape of an
      // InfrastructureError. (TestAppError defaults to NOT_FOUND, so it
      // cannot express "no failureMode".)
      class UntaggedError extends AppError {
        constructor() {
          super({ code: 'UNTAGGED', message: 'Infra failure' }, 'INTERNAL_SERVER_ERROR' as any)
        }
      }

      await cache.getOrFetch('k', async () => err(new UntaggedError()))

      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('still caches a PERMANENT error by default', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err(new TestAppError(FailureMode.PERMANENT)))

      expect(mockRedisSet).toHaveBeenCalledTimes(1)
    })

    it('caches a non-RETRYABLE error when no isRetryable is given', async () => {
      const cache = new ResilientCache<AppError>(redisClient, bareOptions)
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err(new TestAppError(FailureMode.NOT_FOUND)))

      expect(mockRedisSet).toHaveBeenCalledTimes(1)
    })
  })

  describe('abort and timeout propagation', () => {
    it('fails fast without calling the fetcher when the parent signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort('client gone')
      mockRedisGet.mockResolvedValue(null)

      const fetcher = vi.fn()
      const result = await resilientCache.getOrFetch(
        'k',
        fetcher,
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
        expect((result.error as TimeoutExceededError).originalError).toBe('client gone')
      }
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('reports the parent abort reason when the fetcher throws after the parent aborted', async () => {
      const controller = new AbortController()
      mockRedisGet.mockResolvedValue(null)

      const fetcher = vi.fn(async () => {
        controller.abort('client disconnected')
        throw new Error('socket closed')
      })

      const result = await resilientCache.getOrFetch(
        'k',
        fetcher,
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
        expect((result.error as TimeoutExceededError).originalError).toBe('client disconnected')
      }
    })

    it('works when no budget is supplied at all', async () => {
      // Successor to the old "ignores a non-AbortSignal parent" guard: the
      // parameter is a typed class now, and its default is an unbounded budget.
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await resilientCache.getOrFetch('k', async () => ok('fine'))

      expect(isOk(result)).toBe(true)
    })

    it('hands the fetcher a live budget of its own', async () => {
      // Liveness is sampled *inside* the fetcher, at the instant the budget is
      // handed over — that is the claim. Reading `seen.expired` after the call
      // returned would instead measure how long the assertions took to reach,
      // and fail on a loaded machine rather than on logic.
      const controller = new AbortController()
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let seen: Deadline | undefined
      let liveOnHandover: boolean | undefined
      await cache.getOrFetch(
        'k',
        async (deadline: Deadline) => {
          seen = deadline
          liveOnHandover = !deadline.expired
          return ok('fine')
        },
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(seen).toBeInstanceOf(Deadline)
      expect(liveOnHandover).toBe(true)
    })
  })

  describe('in-flight deduplication', () => {
    it('runs the fetcher once for concurrent callers of the same key', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let release: (v: Result<string, AppError>) => void = () => {}
      const pending = new Promise<Result<string, AppError>>((resolve) => {
        release = resolve
      })
      const fetcher = vi.fn(() => pending)

      const first = resilientCache.getOrFetch('same-key', fetcher)
      const second = resilientCache.getOrFetch('same-key', fetcher)

      release(ok('shared'))
      const [a, b] = await Promise.all([first, second])

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(isOk(a) && a.value).toBe('shared')
      expect(isOk(b) && b.value).toBe('shared')
    })

    it('frees the key again once the in-flight fetch settles', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const fetcher = vi.fn(async () => ok('v'))
      await resilientCache.getOrFetch('k', fetcher)
      await resilientCache.getOrFetch('k', fetcher)

      expect(fetcher).toHaveBeenCalledTimes(2)
    })
  })

  describe('write-path resilience', () => {
    it('still returns the value when the cache write fails', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockRejectedValue(new Error('redis down'))

      const result = await resilientCache.getOrFetch('k', async () => ok('value'))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toBe('value')
      }
      expect(logger.warn).toHaveBeenCalled()
    })

    it('still returns the value when the cache read fails', async () => {
      mockRedisGet.mockRejectedValue(new Error('redis down'))
      mockRedisSet.mockResolvedValue('OK')

      const result = await resilientCache.getOrFetch('k', async () => ok('value'))

      expect(isOk(result)).toBe(true)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('treats an unparseable payload as a miss and refetches', async () => {
      mockRedisGet.mockResolvedValue('{not json')
      mockRedisSet.mockResolvedValue('OK')

      const fetcher = vi.fn(async () => ok('fresh'))
      const result = await resilientCache.getOrFetch('k', fetcher)

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(isOk(result)).toBe(true)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('treats a failure envelope with no error payload as a miss and refetches', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: false }))
      mockRedisSet.mockResolvedValue('OK')

      const fetcher = vi.fn(async () => ok('fresh'))
      const result = await resilientCache.getOrFetch('k', fetcher)

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(isOk(result)).toBe(true)
    })

    it('logs a skip rather than writing when the TTL resolves to zero', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        defaultTtlSeconds: 0,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      await cache.getOrFetch('k', async () => ok('value'))

      expect(mockRedisSet).not.toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalled()
    })
  })

  describe('key and read edge cases', () => {
    it('separates params so concatenation cannot collide two different inputs', () => {
      // Without a separator both of these would flatten to "a:1b:2".
      const two = resilientCache.generateKey({ a: '1', b: '2' })
      const one = resilientCache.generateKey({ a: '1b:2' })

      expect(two).not.toBe(one)
    })

    it('treats an empty stored payload as a miss rather than a hit', async () => {
      mockRedisGet.mockResolvedValue('')
      mockRedisSet.mockResolvedValue('OK')

      const fetcher = vi.fn(async () => ok('fresh'))
      const result = await resilientCache.getOrFetch('k', fetcher)

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toBe('fresh')
      }
    })

    it('joins an already-registered in-flight fetch without re-reading Redis', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let releaseFetch: (v: Result<string, AppError>) => void = () => {}
      const pending = new Promise<Result<string, AppError>>((resolve) => {
        releaseFetch = resolve
      })
      const fetcher = vi.fn(() => pending)

      const first = resilientCache.getOrFetch('dedup-key', fetcher)

      // Let the first caller finish its Redis read and register the in-flight
      // fetch, so the second caller hits the fast in-memory dedup path.
      await new Promise((resolve) => setImmediate(resolve))
      const readsBeforeSecondCaller = mockRedisGet.mock.calls.length

      const second = resilientCache.getOrFetch('dedup-key', fetcher)

      releaseFetch(ok('shared'))
      const [a, b] = await Promise.all([first, second])

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(mockRedisGet).toHaveBeenCalledTimes(readsBeforeSecondCaller)
      expect(isOk(a) && a.value).toBe('shared')
      expect(isOk(b) && b.value).toBe('shared')
    })
  })

  describe('hard timeout', () => {
    it('settles with a timeout when the fetcher never resolves', async () => {
      vi.useFakeTimers()
      try {
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockClear()

        const fetcher = vi.fn(() => new Promise<Result<string, AppError>>(() => {}))
        const pending = resilientCache.getOrFetch('k', fetcher)

        await vi.advanceTimersByTimeAsync(defaultOptions.fetchTimeoutMs * 2)
        const result = await pending

        expect(isErr(result)).toBe(true)
        if (isErr(result)) {
          expect(result.error).toBeInstanceOf(DeadlineExceededError)
        }
        // A timeout is retryable, so nothing may be written to the cache.
        expect(mockRedisSet).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('still caches a value the fetcher produced after the caller gave up', async () => {
      // Behaviour change (D11). The caller who walked away gets its own
      // DeadlineExceededError, but the work it paid for is not thrown away —
      // the next caller for this key gets a hit instead of repeating it.
      const controller = new AbortController()
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')

      const fetcher = vi.fn(async () => {
        controller.abort()
        return ok('computed anyway')
      })

      const result = await resilientCache.getOrFetch(
        'k',
        fetcher,
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
      const payload = JSON.parse(mockRedisSet.mock.calls[0][1] as string)
      expect(payload).toMatchObject({ s: true, v: 'computed anyway' })
    })

    it('releases the pending slot after a timeout so the key is retried, not wedged', async () => {
      vi.useFakeTimers()
      try {
        mockRedisGet.mockResolvedValue(null)
        const stalled = vi.fn(() => new Promise<Result<string, AppError>>(() => {}))
        const first = resilientCache.getOrFetch('k', stalled)
        await vi.advanceTimersByTimeAsync(defaultOptions.fetchTimeoutMs * 2)
        await first
      } finally {
        vi.useRealTimers()
      }

      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      const second = vi.fn(async () => ok('recovered'))
      const result = await resilientCache.getOrFetch('k', second)

      expect(second).toHaveBeenCalledTimes(1)
      expect(isOk(result) && result.value).toBe('recovered')
    })
  })

  describe('default serializer edge cases', () => {
    it('labels an error with no constructor name generically', async () => {
      const cache = new ResilientCache<AppError>(redisClient, {
        prefix: 'bare:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 30,
        fetchTimeoutMs: 5_000,
        isRetryable: () => false,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const nameless = { constructor: undefined, message: 'boom' } as unknown as AppError
      await cache.getOrFetch('k', async () => err(nameless))

      const payload = JSON.parse(mockRedisSet.mock.calls.at(-1)?.[1] as string)
      expect(payload.e.type).toBe('Error')
    })

    it('stringifies an error that carries no message', async () => {
      const cache = new ResilientCache<AppError>(redisClient, {
        prefix: 'bare:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 30,
        fetchTimeoutMs: 5_000,
        isRetryable: () => false,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err('plain failure' as unknown as AppError))

      const payload = JSON.parse(mockRedisSet.mock.calls.at(-1)?.[1] as string)
      expect(payload.e.message).toBe('plain failure')
    })
  })

  describe('signal logic — exhaustive', () => {
    it('keeps and caches a value that settled before a same-tick abort', async () => {
      // Behaviour change (D11). This used to discard the result: the old
      // post-fetch abort check threw away an answer that had already been
      // computed. The deadline now stops us starting or waiting on work — it
      // never discards work already finished.
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')
      const controller = new AbortController()

      const result = await resilientCache.getOrFetch(
        'k',
        () => {
          const settled = Promise.resolve(ok('computed after abort'))
          controller.abort('caller gave up')
          return settled
        },
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      // The answer survives for the next caller rather than being recomputed.
      await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
      expect(JSON.parse(mockRedisSet.mock.calls[0][1] as string)).toMatchObject({
        s: true,
        v: 'computed after abort',
      })
    })

    it('still negative-caches a failure that settled before a same-tick abort', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')
      const controller = new AbortController()

      const result = await resilientCache.getOrFetch(
        'k',
        () => {
          const settled = Promise.resolve(err(new TestAppError()))
          controller.abort('caller gave up')
          return settled
        },
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      // A NOT_FOUND answer is knowledge about the key; the caller giving up
      // does not make it less true.
      await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
    })

    it('reports the abort reason from an already-aborted parent signal', async () => {
      mockRedisGet.mockResolvedValue(null)
      const controller = new AbortController()
      controller.abort('parent reason')

      const result = await resilientCache.getOrFetch(
        'k',
        vi.fn(),
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect((result.error as TimeoutExceededError).originalError).toBe('parent reason')
      }
    })

    it('falls back to a generic reason when the signal aborts with a falsy one', async () => {
      mockRedisGet.mockResolvedValue(null)
      const controller = new AbortController()
      controller.abort('') // a real abort, but with no usable reason

      const fetcher = vi.fn()
      const result = await resilientCache.getOrFetch(
        'k',
        fetcher,
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect((result.error as DeadlineExceededError).originalError).toBe('DEADLINE_EXPIRED')
      }
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('gives the fetcher a signal that is not the parent, but tracks it', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      const controller = new AbortController()

      let seen: Deadline | undefined
      await resilientCache.getOrFetch(
        'k',
        async (deadline: Deadline) => {
          seen = deadline
          return ok('v')
        },
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(seen).not.toBe(controller.signal)
      expect(seen?.expired).toBe(false)
    })

    it('does NOT abort the shared fetch when one caller aborts', async () => {
      // Behaviour change (D4). The fetch belongs to the cache, not to whichever
      // caller arrived first, so one caller leaving cannot cancel work that
      // other callers are still waiting on.
      mockRedisGet.mockResolvedValue(null)
      const controller = new AbortController()

      let seen: Deadline | undefined
      await resilientCache.getOrFetch(
        'k',
        (deadline: Deadline) => {
          seen = deadline
          controller.abort()
          return new Promise<Result<string, AppError>>(() => {})
        },
        Deadline.in(Infinity, { linkedTo: controller.signal }),
      )

      expect(seen).toBeInstanceOf(Deadline)
      expect(seen?.expired).toBe(false)
    })

    it('works with no parent signal at all', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await resilientCache.getOrFetch('k', async (deadline: Deadline) => {
        expect(deadline).toBeInstanceOf(Deadline)
        return ok('v')
      })

      expect(isOk(result)).toBe(true)
    })

    it('maps a non-timeout throw from the fetcher to a provider failure', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      // A budget that cannot expire during the test. The shared cache allows
      // 100ms of real time, and when the machine is loaded that elapses before
      // the throw is classified — at which point the cache correctly reports
      // ABORTED instead, and this assertion fails for a reason that has nothing
      // to do with error mapping.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })

      const result = await cache.getOrFetch('k', async () => {
        throw new Error('boom')
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
      // A thrown fetcher is never negative-cached.
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('maps a TimeoutExceededError thrown by the fetcher to a timeout, not a provider failure', async () => {
      mockRedisGet.mockResolvedValue(null)

      // Same exposure as the test above: classification, not the clock, must
      // decide the outcome.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })

      const result = await cache.getOrFetch('k', async () => {
        throw new TimeoutExceededError('inner timeout')
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        // Already classified by the layer that raised it — not re-wrapped.
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }
    })
  })

  describe('observability contracts', () => {
    it('counts a hit on a success envelope', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true, v: 'v' }))

      await resilientCache.getOrFetch('k', vi.fn())

      expect(collectMetricsCacheHits!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
      expect(collectMetricsCacheMisses!.inc).not.toHaveBeenCalled()
    })

    it('counts a hit on a negative envelope too', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: false, e: { type: 'TestAppError', message: 'x' } }))

      await resilientCache.getOrFetch('k', vi.fn())

      expect(collectMetricsCacheHits!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
    })

    it('counts a miss when the key is absent', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('k', async () => ok('v'))

      expect(collectMetricsCacheMisses!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
      expect(collectMetricsCacheHits!.inc).not.toHaveBeenCalled()
    })

    it('labels a read failure as a read error', async () => {
      mockRedisGet.mockRejectedValue(new Error('redis down'))
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('k', async () => ok('v'))

      expect(collectMetricsCacheErrors!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:', error_type: 'read' })
    })

    it('labels an unparseable payload as a corrupted error', async () => {
      mockRedisGet.mockResolvedValue('not json')
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('k', async () => ok('v'))

      expect(collectMetricsCacheErrors!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:', error_type: 'corrupted' })
    })

    it('labels a success envelope missing its value as corrupted', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true }))

      await resilientCache.getOrFetch('k', vi.fn())

      expect(collectMetricsCacheErrors!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:', error_type: 'corrupted' })
    })

    it('labels a write failure as a write error', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockRejectedValue(new Error('redis down'))

      await resilientCache.getOrFetch('k', async () => ok('v'))

      expect(collectMetricsCacheErrors!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:', error_type: 'write' })
    })

    it('tracks the pending-fetch gauge up and back down to zero', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('k', async () => ok('v'))

      expect(collectMetricsCachePendingFetches!.set).toHaveBeenCalledWith({ prefix: 'test-cache:' }, 1)
      expect(collectMetricsCachePendingFetches!.set).toHaveBeenLastCalledWith({ prefix: 'test-cache:' }, 0)
    })

    it('returns the gauge to zero even when the fetcher throws', async () => {
      mockRedisGet.mockResolvedValue(null)

      await resilientCache.getOrFetch('k', async () => {
        throw new Error('boom')
      })

      expect(collectMetricsCachePendingFetches!.set).toHaveBeenLastCalledWith({ prefix: 'test-cache:' }, 0)
    })

    it('counts a circuit-breaker trip when MAX_PENDING is reached', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, maxPendingFetches: 1 })
      mockRedisGet.mockResolvedValue(null)

      const inflight = cache.getOrFetch('busy', () => new Promise<Result<string, AppError>>(() => {}))
      await new Promise((resolve) => setImmediate(resolve))

      const rejected = await cache.getOrFetch('other', vi.fn())

      expect(isErr(rejected)).toBe(true)
      expect(collectMetricsCacheCircuitBreakerTrips!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
      void inflight
    })

    it('observes fetch duration for a failing fetch as well as a successful one', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('k', async () => ok('v'))
      await resilientCache.getOrFetch('k2', async () => err(new TestAppError()))

      expect(collectMetricsCacheFetchDuration!.startTimer).toHaveBeenCalledTimes(2)
      expect(collectMetricsCacheFetchDuration!.startTimer).toHaveBeenCalledWith({ prefix: 'test-cache:' })
    })

    it('counts a trip when the fetch circuit opens', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        fetchTimeoutMs: 5_000,
        circuitBreaker: {
          failureThreshold: 0.5,
          samplingWindowMs: 1_000,
          minimumThroughput: 1,
          halfOpenAfterMs: 10_000,
        },
      })
      mockRedisGet.mockResolvedValue(null)
      const failing = vi.fn(async () => err(new ProviderFailureError(new Error('upstream down'))))

      await cache.getOrFetch('k1', failing)
      await cache.getOrFetch('k2', failing)
      await cache.getOrFetch('k3', failing)

      expect(collectMetricsCacheCircuitBreakerTrips!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
    })

    it('never touches the upstream when the fetch limiter is full', async () => {
      // The limit guards the *shared fetch*, not the entry point. A caller may
      // still be answered from Redis — that costs the upstream nothing and can
      // serve a perfectly good hit — but no new fetch is admitted. Previously
      // the check sat at the top of getOrFetch and refused cache hits too,
      // which spent nothing upstream and helped no one.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, maxPendingFetches: 0 })
      mockRedisGet.mockResolvedValue(null)
      const fetcher = vi.fn()

      const result = await cache.getOrFetch('k', fetcher)

      expect(fetcher).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(InfraServiceOverloadError)
      }
      expect(collectMetricsCacheCircuitBreakerTrips!.inc).toHaveBeenCalledWith({ prefix: 'test-cache:' })
    })

    it('still serves a cache hit while the fetch limiter is full', async () => {
      // The behaviour the old entry-point check got wrong.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, maxPendingFetches: 0 })
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true, v: 'cached' }))
      const fetcher = vi.fn()

      const result = await cache.getOrFetch('k', fetcher)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBe('cached')
      expect(fetcher).not.toHaveBeenCalled()
    })
  })

  describe('diagnostic causes on reconstructed errors', () => {
    it('names the corruption when a success envelope has no value', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true }))

      const result = await resilientCache.getOrFetch('k', vi.fn())

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        const cause = (result.error as ProviderFailureError).originalError as Error
        expect(cause.message).toBe('Corrupted Cache: Missing value')
      }
    })

    it('carries the cached type and message when no deserializer can rebuild it', async () => {
      const cache = new ResilientCache<AppError>(redisClient, {
        prefix: 'test-cache:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 10,
        fetchTimeoutMs: 5_000,
      })
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: false, e: { type: 'GoneError', message: 'vanished' } }))

      const result = await cache.getOrFetch('k', vi.fn())

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        const cause = (result.error as ProviderFailureError).originalError as Error
        expect(cause.message).toBe('Cached Error: GoneError - vanished')
      }
    })

    it('keeps the thrown fetcher error as the cause of the provider failure', async () => {
      mockRedisGet.mockResolvedValue(null)
      const thrown = new Error('socket hang up')

      const result = await resilientCache.getOrFetch('k', async () => {
        throw thrown
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect((result.error as ProviderFailureError).originalError).toBe(thrown)
      }
    })
  })

  describe('TTL jitter maths', () => {
    /**
     * The offset is stubbed directly rather than through the generator's
     * internals: the contract is "an integer uniformly drawn from
     * [-amount, +amount], added to the base TTL and clamped at 1", and a test
     * that reconstructed the arithmetic would pass just as happily against a
     * generator asked for the wrong range.
     */
    async function ttlWithOffset(offset: number, baseTtl: number, jitter: number) {
      const spy = vi.spyOn(crypto, 'randomInt').mockReturnValue(offset as never)
      try {
        const cache = new ResilientCache<AppError | null>(redisClient, {
          ...defaultOptions,
          defaultTtlSeconds: baseTtl,
          ttlJitterPercentage: jitter,
        })
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue('OK')
        await cache.getOrFetch('k', async () => ok('v'))
        // The calls are copied out here, not read from `spy` by the caller:
        // `finally` runs mockRestore() before the caller sees the result, and
        // that wipes the recorded calls.
        return {
          ttl: mockRedisSet.mock.calls.at(-1)?.[3] as number,
          randomIntCalls: spy.mock.calls.map((call) => [...call]),
        }
      } finally {
        spy.mockRestore()
      }
    }

    it('draws the offset from the inclusive range [-amount, +amount]', async () => {
      // base 1000, jitter 10% -> amount 100. randomInt's upper bound is
      // exclusive, so +100 is only reachable if the call asks for 101.
      const { randomIntCalls } = await ttlWithOffset(0, 1000, 0.1)

      expect(randomIntCalls).toEqual([[-100, 101]])
    })

    it('subtracts the full jitter at the bottom of the range', async () => {
      expect((await ttlWithOffset(-100, 1000, 0.1)).ttl).toBe(900)
    })

    it('lands on the base TTL in the middle of the range', async () => {
      expect((await ttlWithOffset(0, 1000, 0.1)).ttl).toBe(1000)
    })

    it('adds the full jitter at the top of the range', async () => {
      expect((await ttlWithOffset(100, 1000, 0.1)).ttl).toBe(1100)
    })

    it('writes the exact base TTL when jitter is disabled', async () => {
      expect((await ttlWithOffset(0, 1000, 0)).ttl).toBe(1000)
    })

    it('clamps to at least one second when jitter would drive the TTL to zero', async () => {
      // base 1, jitter 200% -> amount 2; offset -2 would give -1 seconds, and
      // Redis rejects a non-positive EX.
      expect((await ttlWithOffset(-2, 1, 2)).ttl).toBe(1)
    })

    it('uses a cryptographic generator rather than Math.random', async () => {
      // The security finding this replaced (S2245): a predictable expiry lets
      // an attacker line requests up with it and force a stampede.
      const mathRandom = vi.spyOn(Math, 'random')
      try {
        await ttlWithOffset(0, 1000, 0.1)

        expect(mathRandom).not.toHaveBeenCalled()
      } finally {
        mathRandom.mockRestore()
      }
    })
  })

  describe('timer and listener cleanup', () => {
    it('clears the hard-timeout timer once the fetch settles', async () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
      try {
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue('OK')

        await resilientCache.getOrFetch('k', async () => ok('v'))

        expect(clearSpy).toHaveBeenCalled()
        expect(clearSpy.mock.calls.some(([id]) => typeof id !== 'undefined')).toBe(true)
      } finally {
        clearSpy.mockRestore()
      }
    })

    it('clears the timer even when the fetch fails', async () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
      try {
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue('OK')

        await resilientCache.getOrFetch('k', async () => err(new TestAppError()))

        expect(clearSpy).toHaveBeenCalled()
      } finally {
        clearSpy.mockRestore()
      }
    })

    it('subscribes to abort once, and unsubscribes the same listener afterwards', async () => {
      const addSpy = vi.spyOn(AbortSignal.prototype, 'addEventListener')
      const removeSpy = vi.spyOn(AbortSignal.prototype, 'removeEventListener')
      try {
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue('OK')

        await resilientCache.getOrFetch('k', async () => ok('v'))

        const added = addSpy.mock.calls.find(([event]) => event === 'abort')
        expect(added).toBeDefined()
        expect(added?.[2]).toEqual({ once: true })

        // The very same handler must be detached, or long-lived signals leak.
        expect(removeSpy).toHaveBeenCalledWith('abort', added?.[1])
      } finally {
        addSpy.mockRestore()
        removeSpy.mockRestore()
      }
    })

    it('detaches the abort listener even when the fetcher throws', async () => {
      const removeSpy = vi.spyOn(AbortSignal.prototype, 'removeEventListener')
      try {
        mockRedisGet.mockResolvedValue(null)

        await resilientCache.getOrFetch('k', async () => {
          throw new Error('boom')
        })

        expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
      } finally {
        removeSpy.mockRestore()
      }
    })

    it('reports a generic reason for a hard timeout with no parent signal', async () => {
      vi.useFakeTimers()
      try {
        mockRedisGet.mockResolvedValue(null)
        const pending = resilientCache.getOrFetch('k', () => new Promise<Result<string, AppError>>(() => {}))
        await vi.advanceTimersByTimeAsync(defaultOptions.fetchTimeoutMs * 2)
        const result = await pending

        expect(isErr(result)).toBe(true)
        if (isErr(result)) {
          expect((result.error as DeadlineExceededError).originalError).toBe('DEADLINE_EXPIRED')
        }
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('budget enforcement without a parent signal', () => {
    it('arms its own fetch timeout, aborting a fetcher that never settles', async () => {
      // The composed signal must actually contain the timeout: without it a
      // hung provider would hold the request open indefinitely.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 40 })
      mockRedisGet.mockResolvedValue(null)

      let observed: Deadline | undefined
      const result = await cache.getOrFetch('k', async (signal) => {
        observed = signal
        return await new Promise<never>(() => {}) // never settles on its own
      })

      expect(observed?.expired).toBe(true)
      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    })

    it('hands the fetcher a signal that is live before the budget runs out', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let aborted: boolean | undefined
      await cache.getOrFetch('k', async (deadline: Deadline) => {
        aborted = deadline.expired
        return ok('value')
      })

      expect(aborted).toBe(false)
    })
  })

  describe('isRetryable override precedence', () => {
    it('uses the caller policy instead of the built-in default', async () => {
      // A NOT_FOUND would be cached by the default; the override must win.
      const isRetryable = vi.fn().mockReturnValue(true)
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, isRetryable })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      await cache.getOrFetch('k', async () => err(new InvalidCepError('01310100')))

      expect(isRetryable).toHaveBeenCalledOnce()
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('lets the caller policy force caching of something the default would skip', async () => {
      // Inverse direction, so the test cannot pass by ignoring the override.
      const isRetryable = vi.fn().mockReturnValue(false)
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, isRetryable })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err(new ServiceBusyError('ViaCEP')))

      expect(isRetryable).toHaveBeenCalledOnce()
      expect(mockRedisSet).toHaveBeenCalledOnce()
    })
  })

  describe('read miss handling', () => {
    it.each([
      ['null', null],
      ['an empty string', ''],
    ])('treats %s from Redis as a miss and runs the fetcher', async (_label, stored) => {
      mockRedisGet.mockResolvedValue(stored)
      mockRedisSet.mockResolvedValue('OK')
      const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

      const result = await resilientCache.getOrFetch('k', fetcher)

      expect(fetcher).toHaveBeenCalledOnce()
      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBe('fresh')
    })

    it('logs the key alongside a Redis read failure', async () => {
      mockRedisGet.mockRejectedValue(new Error('connection reset'))
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('cache:key-in-question', async () => ok('fresh'))

      // Without the key in the log a read failure cannot be traced to an input.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'cache:key-in-question' }),
        expect.anything(),
      )
    })

    it('logs the key alongside a corrupted payload', async () => {
      mockRedisGet.mockResolvedValue('{ not json')
      mockRedisSet.mockResolvedValue('OK')

      await resilientCache.getOrFetch('cache:corrupt-key', async () => ok('fresh'))

      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ key: 'cache:corrupt-key' }), expect.anything())
    })
  })

  describe('serializer override and hostile errors', () => {
    it('stores what the caller serializer produced, not the built-in shape', async () => {
      const serializeError = vi.fn().mockReturnValue({ type: 'CustomShape', message: 'custom message' })
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        serializeError,
        isRetryable: () => false,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      mockRedisSet.mockResolvedValue('OK')

      await cache.getOrFetch('k', async () => err(new InvalidCepError('01310100')))

      expect(serializeError).toHaveBeenCalledOnce()
      const payload = JSON.parse(mockRedisSet.mock.calls[0][1] as string)
      expect(payload.e).toMatchObject({ type: 'CustomShape', message: 'custom message' })
    })

    it('survives a fetcher that fails with a null error instead of an AppError', async () => {
      // Nothing stops a caller returning err(null); reading `.failureMode` off it
      // must not take the whole cache down.
      const cache = new ResilientCache<AppError | null>(redisClient, {
        prefix: 'bare:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 30,
        fetchTimeoutMs: 5_000,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await cache.getOrFetch('k', async () => err(null))

      expect(isErr(result)).toBe(true)
    })

    it('survives a fetcher that fails with undefined', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        prefix: 'bare:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 30,
        fetchTimeoutMs: 5_000,
      })
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await cache.getOrFetch('k', async () => err(undefined as never))

      expect(isErr(result)).toBe(true)
    })

    it('names the key and the envelope when a stored success has no value', async () => {
      // A success envelope missing `v` is corruption; the log must say which key.
      mockRedisGet.mockResolvedValue(JSON.stringify({ s: true }))

      await resilientCache.getOrFetch('cache:no-value-key', async () => ok('fresh'))

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'cache:no-value-key', envelope: { s: true } }),
        expect.anything(),
      )
    })
  })

  describe('shared fetch ownership (D4)', () => {
    it('lets a second caller succeed after the first one gives up', async () => {
      // The regression this fixes: the in-flight promise used to be bound to
      // whoever arrived first, so their cancellation propagated to everyone.
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      // A 5 s shared budget, not the 100 ms default: this test is about who owns
      // the in-flight promise, and the fetcher is released by hand. On the default
      // budget the shared deadline expires on wall-clock time under load and the
      // second caller fails for a reason the test is not asking about.
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, fetchTimeoutMs: 5_000 })
      const firstCaller = new AbortController()
      let release: (value: Result<string, AppError>) => void = () => {}
      const fetcher = vi.fn(
        () =>
          new Promise<Result<string, AppError>>((resolve) => {
            release = resolve
          }),
      )

      const first = cache.getOrFetch('k', fetcher, Deadline.in(Infinity, { linkedTo: firstCaller.signal }))
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
      const second = cache.getOrFetch('k', fetcher, Deadline.in(30_000))

      firstCaller.abort('first caller went away')
      release(ok('answer'))

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(isErr(firstResult)).toBe(true)
      if (isErr(firstResult)) expect(firstResult.error).toBeInstanceOf(DeadlineExceededError)

      // The second caller is unharmed by the first one's cancellation.
      expect(isOk(secondResult)).toBe(true)
      if (isOk(secondResult)) expect(secondResult.value).toBe('answer')
      expect(fetcher).toHaveBeenCalledOnce()
    })

    it('gives up on a slow shared fetch per-caller, without cancelling it', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let release: (value: Result<string, AppError>) => void = () => {}
      const fetcher = vi.fn(
        () =>
          new Promise<Result<string, AppError>>((resolve) => {
            release = resolve
          }),
      )

      const impatient = new AbortController()
      const impatientCall = resilientCache.getOrFetch(
        'k',
        fetcher,
        Deadline.in(Infinity, { linkedTo: impatient.signal }),
      )
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())

      impatient.abort('too slow for me')
      expect(isErr(await impatientCall)).toBe(true)

      // The fetch itself is untouched, so its answer still reaches the cache.
      release(ok('eventual answer'))
      await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
    })

    it('does not deregister the key when a caller leaves, so no duplicate fetch starts', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let release: (value: Result<string, AppError>) => void = () => {}
      const fetcher = vi.fn(
        () =>
          new Promise<Result<string, AppError>>((resolve) => {
            release = resolve
          }),
      )

      const leaver = new AbortController()
      const leaving = resilientCache.getOrFetch('k', fetcher, Deadline.in(Infinity, { linkedTo: leaver.signal }))
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
      leaver.abort('gone')
      await leaving

      // A later arrival must join the in-flight fetch, not start a second one.
      const later = resilientCache.getOrFetch('k', fetcher, Deadline.in(30_000))
      release(ok('answer'))

      expect(isOk(await later)).toBe(true)
      expect(fetcher).toHaveBeenCalledOnce()
    })
  })

  describe('Redis round-trips inside the budget (D3)', () => {
    // Fake timers throughout: these assert that a bounded wait *ends*, and
    // waiting on a real 300ms timer would make them fail under load rather
    // than on logic.
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('treats a read that outlasts its slice of the budget as a miss', async () => {
      // A degraded Redis must not be able to spend the caller's whole budget.
      mockRedisGet.mockImplementation(() => new Promise(() => {}))
      mockRedisSet.mockResolvedValue('OK')
      const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

      const pending = resilientCache.getOrFetch('k', fetcher, Deadline.in(30_000))
      await vi.advanceTimersByTimeAsync(CACHE_CONFIG.REDIS_OP_BUDGET_MS)
      const result = await pending

      expect(fetcher).toHaveBeenCalledOnce()
      expect(isOk(result)).toBe(true)
    })

    it('bounds the read by the caller budget when that is the tighter of the two', async () => {
      mockRedisGet.mockImplementation(() => new Promise(() => {}))
      mockRedisSet.mockResolvedValue('OK')
      const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

      // 50ms of budget left is less than the 300ms Redis slice, so the read
      // must give up at 50ms — the derived deadline can only ever shrink.
      const pending = resilientCache.getOrFetch('k', fetcher, Deadline.in(50))
      await vi.advanceTimersByTimeAsync(50)
      const result = await pending

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    })

    it('does not let a hanging write hold the answer back', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockImplementation(() => new Promise(() => {}))

      const pending = resilientCache.getOrFetch('k', async () => ok('value'), Deadline.in(30_000))
      await vi.advanceTimersByTimeAsync(CACHE_CONFIG.REDIS_OP_BUDGET_MS)
      const result = await pending

      // The value is returned on the write's own small budget, never the caller's.
      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBe('value')
    })
  })
})
