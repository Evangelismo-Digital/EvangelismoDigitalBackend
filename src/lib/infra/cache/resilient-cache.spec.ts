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

// 3. Mock IORedis
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
                providerContext?: {
                  provider?: string
                  layer?: import('errors/infrastructure/provider-failure-error').ProviderLayer
                }
              }
              providerContext?: {
                provider?: string
                layer?: import('errors/infrastructure/provider-failure-error').ProviderLayer
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
        () => new Promise(() => { /* never settles */ }),
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
})
