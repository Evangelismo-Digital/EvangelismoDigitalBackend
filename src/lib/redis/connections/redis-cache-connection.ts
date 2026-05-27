import { env } from '@env/index'
import { logger } from '@lib/logger'
import Redis from 'ioredis'

export function createRedisCacheConnection() {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    commandTimeout: 1000,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 2) return null
      return Math.min(times * 50, 500)
    },
  })

  redis.on('error', (error) => {
    logger.error(
      {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
      '❌ Redis cache connection error',
    )
  })

  redis.on('close', () => {
    logger.warn('⚠️ Redis cache connection closed')
  })

  return redis
}
