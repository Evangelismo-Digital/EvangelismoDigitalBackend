import { env } from '@env/index'
import Redis from 'ioredis'
import { attachOutageLogging } from './attach-outage-logging'
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

  attachOutageLogging(redis, 'cache', REDIS_LOGS.CACHE_UNEXPECTED_ERROR)

  return redis
}
