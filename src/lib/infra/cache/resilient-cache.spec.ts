// src/lib/redis/helper/resilient-cache.spec.ts

import { vi, describe, it, expect, beforeEach } from 'vitest'

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
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { logger } from '@lib/logger'
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

  // === 2. executeFetchWithSignalLogic ===
  describe('executeFetchWithSignalLogic', () => {
    const executeFetch = (key: string, fetcher: any) =>
      (resilientCache as any).executeFetchWithSignalLogic(key, fetcher, undefined)

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

      const p1 = resilientCache.getOrFetch(generatedKey, fetcher)
      const p2 = resilientCache.getOrFetch(generatedKey, fetcher)

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
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
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
      const fetcher = vi.fn().mockImplementation(async (signal) => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        if (signal.aborted) {
          return err(new TimeoutExceededError())
        }
        return ok('done')
      })

      const result = await resilientCache.getOrFetch(generatedKey, fetcher)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
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
        negativeTtlFor: () => 4242,
      })

      expect(await ttlFor(cache, new TestAppError())).toBe(4242)
    })

    it('falls back to negativeTtlSeconds when negativeTtlFor is absent', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, {
        ...defaultOptions,
        ttlJitterPercentage: 0,
        negativeTtlSeconds: 77,
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
    const bareOptions = { prefix: 'bare:', defaultTtlSeconds: 60, negativeTtlSeconds: 30 }

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
      const result = await resilientCache.getOrFetch('k', fetcher, controller.signal)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
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

      const result = await resilientCache.getOrFetch('k', fetcher, controller.signal)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
        expect((result.error as TimeoutExceededError).originalError).toBe('client disconnected')
      }
    })

    it('ignores a parentSignal that is not an AbortSignal instead of throwing', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await resilientCache.getOrFetch('k', async () => ok('fine'), {} as AbortSignal)

      expect(isOk(result)).toBe(true)
    })

    it('hands the fetcher a live signal derived from the parent', async () => {
      const controller = new AbortController()
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      let seen: AbortSignal | undefined
      await resilientCache.getOrFetch(
        'k',
        async (signal) => {
          seen = signal
          return ok('fine')
        },
        controller.signal,
      )

      expect(seen).toBeInstanceOf(AbortSignal)
      expect(seen?.aborted).toBe(false)
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
          expect(result.error).toBeInstanceOf(TimeoutExceededError)
        }
        // A timeout is retryable, so nothing may be written to the cache.
        expect(mockRedisSet).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not cache a value produced after the signal was aborted', async () => {
      const controller = new AbortController()
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      const fetcher = vi.fn(async () => {
        controller.abort()
        return ok('too late')
      })

      const result = await resilientCache.getOrFetch('k', fetcher, controller.signal)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }
      expect(mockRedisSet).not.toHaveBeenCalled()
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
    it('discards AND refuses to cache a value that settled before a same-tick abort', async () => {
      // Regression guard for a load-bearing branch: Promise.race resolves with
      // the already-settled fetch even though the abort listener has fired, so
      // the post-fetch abort check is the only thing stopping a result computed
      // for an abandoned request from being served and persisted.
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      const controller = new AbortController()

      const result = await resilientCache.getOrFetch(
        'k',
        () => {
          const settled = Promise.resolve(ok('computed after abort'))
          controller.abort('caller gave up')
          return settled
        },
        controller.signal,
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('discards a failure that settled before a same-tick abort without caching it', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()
      const controller = new AbortController()

      const result = await resilientCache.getOrFetch(
        'k',
        () => {
          const settled = Promise.resolve(err(new TestAppError()))
          controller.abort('caller gave up')
          return settled
        },
        controller.signal,
      )

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }
      expect(mockRedisSet).not.toHaveBeenCalled()
    })

    it('reports the abort reason from an already-aborted parent signal', async () => {
      mockRedisGet.mockResolvedValue(null)
      const controller = new AbortController()
      controller.abort('parent reason')

      const result = await resilientCache.getOrFetch('k', vi.fn(), controller.signal)

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
      const result = await resilientCache.getOrFetch('k', fetcher, controller.signal)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect((result.error as TimeoutExceededError).originalError).toBe('Timeout Exceeded')
      }
      expect(fetcher).not.toHaveBeenCalled()
    })

    it('gives the fetcher a signal that is not the parent, but tracks it', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')
      const controller = new AbortController()

      let seen: AbortSignal | undefined
      await resilientCache.getOrFetch(
        'k',
        async (signal) => {
          seen = signal
          return ok('v')
        },
        controller.signal,
      )

      expect(seen).not.toBe(controller.signal)
      expect(seen?.aborted).toBe(false)
    })

    it('aborts the fetcher signal when the parent aborts', async () => {
      mockRedisGet.mockResolvedValue(null)
      const controller = new AbortController()

      let seen: AbortSignal | undefined
      await resilientCache.getOrFetch(
        'k',
        (signal) => {
          seen = signal
          controller.abort()
          return new Promise<Result<string, AppError>>(() => {})
        },
        controller.signal,
      )

      expect(seen?.aborted).toBe(true)
    })

    it('works with no parent signal at all', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockResolvedValue('OK')

      const result = await resilientCache.getOrFetch('k', async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal)
        return ok('v')
      })

      expect(isOk(result)).toBe(true)
    })

    it('maps a non-timeout throw from the fetcher to a provider failure', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSet.mockClear()

      const result = await resilientCache.getOrFetch('k', async () => {
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

      const result = await resilientCache.getOrFetch('k', async () => {
        throw new TimeoutExceededError('inner timeout')
      })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
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

    it('does not count a fetch at all when the circuit breaker rejects the call', async () => {
      const cache = new ResilientCache<AppError | null>(redisClient, { ...defaultOptions, maxPendingFetches: 0 })

      await cache.getOrFetch('k', vi.fn())

      expect(collectMetricsCacheMisses!.inc).not.toHaveBeenCalled()
      expect(mockRedisGet).not.toHaveBeenCalled()
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
    async function ttlWithRandom(random: number, baseTtl: number, jitter: number) {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(random)
      try {
        const cache = new ResilientCache<AppError | null>(redisClient, {
          ...defaultOptions,
          defaultTtlSeconds: baseTtl,
          ttlJitterPercentage: jitter,
        })
        mockRedisGet.mockResolvedValue(null)
        mockRedisSet.mockResolvedValue('OK')
        await cache.getOrFetch('k', async () => ok('v'))
        return mockRedisSet.mock.calls.at(-1)?.[3] as number
      } finally {
        spy.mockRestore()
      }
    }

    it('subtracts the full jitter at the bottom of the range', async () => {
      // base 1000, jitter 10% -> amount 100; random 0 -> offset -100
      expect(await ttlWithRandom(0, 1000, 0.1)).toBe(900)
    })

    it('lands on the base TTL in the middle of the range', async () => {
      // random 0.5 -> floor(0.5 * 201) = 100 -> offset 0
      expect(await ttlWithRandom(0.5, 1000, 0.1)).toBe(1000)
    })

    it('adds the full jitter at the top of the range', async () => {
      // random ~1 -> floor(0.999 * 201) = 200 -> offset +100
      expect(await ttlWithRandom(0.999, 1000, 0.1)).toBe(1100)
    })

    it('writes the exact base TTL when jitter is disabled', async () => {
      expect(await ttlWithRandom(0.999, 1000, 0)).toBe(1000)
    })

    it('clamps to at least one second when jitter would drive the TTL to zero', async () => {
      // base 1, jitter 200% -> amount 2; random 0 -> offset -2 -> clamped to 1
      expect(await ttlWithRandom(0, 1, 2)).toBe(1)
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
          expect((result.error as TimeoutExceededError).originalError).toBe('Timeout Exceeded')
        }
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
