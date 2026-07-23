import { vi, describe, it, expect, beforeEach } from 'vitest'

// 1. Mock Environment Variables
vi.mock('@lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent', // Silencia logs durante testes
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
  },
}))

// 2. Mock Logger
vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// 3. Mock IORedis (Função tradicional para permitir 'new')
const mockRedisQuit = vi.fn().mockResolvedValue('OK')
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      quit: mockRedisQuit,
    }
  })
  return {
    default: RedisMock,
    Redis: RedisMock,
  }
})

// 4. Mock rate-limiter-flexible
const mockConsume = vi.fn()
vi.mock('rate-limiter-flexible', () => {
  return {
    RateLimiterRedis: vi.fn().mockImplementation(function () {
      return {
        consume: mockConsume,
      }
    }),
  }
})

// Imports reais após mocks
import Redis from 'ioredis'
import { RateLimiterRedis } from 'rate-limiter-flexible'
import { RedisRateLimiter, EnumProviderConfig } from './redis-rate-limiter'
import { logger } from '@lib/logger'

describe('RedisRateLimiter Unit Tests', () => {
  let redisClient: Redis

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset do Singleton hackeando a propriedade privada
    ;(RedisRateLimiter as any).instance = undefined
    ;(RedisRateLimiter as any).infraOutageStartedAt = null
    ;(RedisRateLimiter as any).infraLastWarnAt = 0
    ;(RedisRateLimiter as any).infraSuppressedLogs = 0
    redisClient = new Redis()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = RedisRateLimiter.getInstance(redisClient)
      const instance2 = RedisRateLimiter.getInstance(redisClient)

      expect(instance1).toBe(instance2)
    })
  })

  describe('tryConsume (Fluxos Principais)', () => {
    it('should allow request (return true) when points are available', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient)

      // Mock sucesso no consume
      mockConsume.mockResolvedValue({ remainingPoints: 1 })

      const result = await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

      expect(result).toBe(true)
      expect(mockConsume).toHaveBeenCalledWith('global', 1)
    })

    it('should block request (return false) when rate limit exceeded', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient)

      // Mock rejeição padrão da lib (objeto com remainingPoints)
      const rateLimitError = { remainingPoints: 0, msBeforeNext: 1000 }
      mockConsume.mockRejectedValue(rateLimitError)

      const result = await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

      expect(result).toBe(false)
      // Não deve logar erro de infraestrutura neste caso
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should allow request (return true) and log WARN on infrastructure failure (Fail-Open)', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient)

      // Mock erro genérico (ex: Redis caiu)
      const infraError = new Error('Connection Lost')
      mockConsume.mockRejectedValue(infraError)

      const result = await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

      expect(result).toBe(true) // Estratégia Fail-Open

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: infraError,
          mode: 'fail-open',
          provider: EnumProviderConfig.VIACEP_ADDRESS,
        }),
        expect.stringContaining('RedisRateLimiter com erro: Redis não disponível, permitindo requisições (fail-open).'),
      )
    })
  })

  describe('getLimiter (Configuração e Cache)', () => {
    it('should create a new limiter with correct config for a provider', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient) as any

      mockConsume.mockResolvedValue({})

      // Executa para triggerar a criação
      await limiter.tryConsume(EnumProviderConfig.LOCATION_IQ_ADDRESS)

      // Verifica se RateLimiterRedis foi instanciado com as configs corretas
      // LOCATION_IQ_ADDRESS tem points: 2, windowSeconds: 1
      expect(RateLimiterRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          storeClient: redisClient,
          keyPrefix: `ratelimit:v1:${EnumProviderConfig.LOCATION_IQ_ADDRESS}`,
          points: 2,
          duration: 1,
        }),
      )
    })

    it('should reuse existing limiter instance for subsequent calls', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient)
      mockConsume.mockResolvedValue({})

      // Primeira chamada
      await limiter.tryConsume(EnumProviderConfig.NOMINATIM_GEOCODING)
      // Segunda chamada
      await limiter.tryConsume(EnumProviderConfig.NOMINATIM_GEOCODING)

      // Filtra chamadas ao construtor para este provider específico
      const callsForProvider = (RateLimiterRedis as any).mock.calls.filter((args: any[]) =>
        args[0].keyPrefix?.includes(EnumProviderConfig.NOMINATIM_GEOCODING),
      )
      expect(callsForProvider).toHaveLength(1)
    })
  })

  describe('Defensive Coding (Memory Leak Protection)', () => {
    it('should log WARN if too many limiters are instantiated', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient) as any
      mockConsume.mockResolvedValue({})

      // Popula o mapa de limiters artificialmente
      for (let i = 0; i < 51; i++) {
        limiter.limiters.set(`fake-provider-${i}`, {})
      }

      // Próxima chamada deve disparar o aviso
      await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ size: expect.any(Number) }),
        expect.stringContaining('ALERTA: Muitos RateLimiters instanciados'),
      )
    })
  })

  describe('destroy', () => {
    it('should clear limiters map and reset singleton instance', async () => {
      const limiter = RedisRateLimiter.getInstance(redisClient) as any

      // Adiciona um limiter
      mockConsume.mockResolvedValue({})
      await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)
      expect(limiter.limiters.size).toBeGreaterThan(0)

      // Destrói usando o método estático
      await RedisRateLimiter.destroyInstance()

      // Verifica se o mapa foi limpo
      expect(limiter.limiters.size).toBe(0)

      // Verifica se a instância singleton foi resetada
      expect((RedisRateLimiter as any).instance).toBeNull()

      // Verifica se o logger foi chamado para cada provider
      expect(logger.debug).toHaveBeenCalledWith(
        { provider: EnumProviderConfig.VIACEP_ADDRESS },
        'Limpando RateLimiter do provider.',
      )
    })

    it('should not throw error when destroying non-existent instance', async () => {
      // Garante que não há instância
      ;(RedisRateLimiter as any).instance = null

      await expect(RedisRateLimiter.destroyInstance()).resolves.not.toThrow()

      expect(logger.debug).toHaveBeenCalledWith('Nenhuma instância de RedisRateLimiter para destruir.')
    })
  })
})
