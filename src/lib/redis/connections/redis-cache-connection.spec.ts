import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('@env/index', () => ({
  env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_LOG_OUTAGE_INTERVAL_MS: 60_000,
  },
}))

vi.mock('@lib/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger }
})

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(function FakeRedisConstructor() {
    return new EventEmitter()
  }),
}))

import { createRedisCacheConnection } from './redis-cache-connection'
import { logger } from '@lib/logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

describe('createRedisCacheConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('erro inesperado (não-conectividade): loga via chave err (serializer decide o formato), sem campos manuais de stack/message', () => {
    const redis = createRedisCacheConnection()
    const error = new Error('falha inesperada não relacionada à conectividade')

    redis.emit('error', error)

    expect(logger.error).toHaveBeenCalledWith(
      { subsystem: 'cache', redisHost: 'localhost', redisPort: 6379, err: error },
      REDIS_LOGS.CACHE_UNEXPECTED_ERROR,
    )
  })

  it('erro de conectividade (ex: ETIMEDOUT): não loga como erro inesperado (tratado pelo RedisOutageLogger)', () => {
    const redis = createRedisCacheConnection()
    const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })

    redis.emit('error', error)

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('nunca captura no Sentry (erro de conexão ioredis, política "terminal/critical only" exclui explicitamente)', () => {
    const redis = createRedisCacheConnection()

    redis.emit('error', new Error('qualquer falha'))

    expect(mockCaptureError).not.toHaveBeenCalled()
  })
})
