import { env } from '@env/index'
import Redis from 'ioredis'
import { attachOutageLogging } from './attach-outage-logging'
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

  attachOutageLogging(redis, 'rate-limiter', REDIS_LOGS.RATE_LIMITER_UNEXPECTED_ERROR)

  return redis
}
