import { env } from '@env/index'
import Redis from 'ioredis'
import { attachOutageLogging } from './attach-outage-logging'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

/** The cache is optional by design: give up quickly and serve from source. */
const MAX_RECONNECT_ATTEMPTS = 2
const RECONNECT_BACKOFF_STEP_MS = 50
const RECONNECT_BACKOFF_MAX_MS = 500

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
      if (times > MAX_RECONNECT_ATTEMPTS) return null
      return Math.min(times * RECONNECT_BACKOFF_STEP_MS, RECONNECT_BACKOFF_MAX_MS)
    },
  })

  attachOutageLogging(redis, 'cache', REDIS_LOGS.CACHE_UNEXPECTED_ERROR)

  return redis
}
