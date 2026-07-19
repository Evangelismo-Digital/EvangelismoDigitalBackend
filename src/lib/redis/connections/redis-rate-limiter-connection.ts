import { env } from '@env/index'
import { logger } from '@lib/logger'
import Redis from 'ioredis'
import { isRedisConnectivityError, RedisOutageLogger } from './redis-outage-logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

export function createRedisRateLimiterConnection() {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,

    // === DIFERENÇAS CHAVE PARA O RATE LIMITER ===

    // 1. Timeout agressivo. Rate Limit tem que ser instantâneo.
    // Se demorar mais que 100ms, aborta para não segurar a API.
    commandTimeout: env.NODE_ENV === 'test' ? 1000 : 100, // Cache costuma ser 1000ms
    connectTimeout: 2000,

    // 2. SEM fila offline.
    // Se a conexão cair, falhe o comando imediatamente (throw error).
    // Não queremos acumular verificações de limite na RAM.
    enableOfflineQueue: false,

    // 3. Poucas retentativas.
    // Se falhou, falhou. O 'Fail-Open' na classe RateLimiter vai lidar com isso.
    maxRetriesPerRequest: 0,
  })

  const outageLogger = new RedisOutageLogger({
    subsystem: 'rate-limiter',
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  })

  redis.on('ready', () => {
    outageLogger.onRecovery()
  })

  redis.on('connect', () => {
    outageLogger.onRecovery()
  })

  redis.on('error', (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage('error', error)
      return
    }

    logger.error(
      {
        subsystem: 'rate-limiter',
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        err: error,
      },
      REDIS_LOGS.RATE_LIMITER_UNEXPECTED_ERROR,
    )
  })

  redis.on('close', () => {
    outageLogger.onOutage('close')
  })

  return redis
}
