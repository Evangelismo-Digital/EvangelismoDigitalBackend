import { env } from '@env/index'
import { logger } from '@lib/logger'
import Redis from 'ioredis'
import { isRedisConnectivityError, RedisOutageLogger } from './redis-outage-logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

export function createRedisCacheConnection() {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    commandTimeout: 1000,
    connectTimeout: 2000,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 2) return null
      return Math.min(times * 50, 500)
    },
  })

  const outageLogger = new RedisOutageLogger({
    subsystem: 'cache',
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
        subsystem: 'cache',
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        err: error,
      },
      REDIS_LOGS.CACHE_UNEXPECTED_ERROR,
    )
  })

  redis.on('close', () => {
    outageLogger.onOutage('close')
  })

  return redis
}
