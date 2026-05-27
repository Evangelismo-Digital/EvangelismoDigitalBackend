import { createRedisBullMQConnection } from '../connections/redis-bullMQ-connection'
import { createRedisCacheConnection } from '../connections/redis-cache-connection'
import { createRedisRateLimiterConnection } from '../connections/redis-rate-limiter-connection'

let redisCacheInstance: ReturnType<typeof createRedisCacheConnection> | null = null
let redisRateLimitInstance: ReturnType<typeof createRedisRateLimiterConnection> | null = null
let redisForQueueInstance: ReturnType<typeof createRedisBullMQConnection> | null = null

export function getRedisCache() {
  if (!redisCacheInstance) {
    redisCacheInstance = createRedisCacheConnection()
  }

  return redisCacheInstance
}

export function getRedisRateLimit() {
  if (!redisRateLimitInstance) {
    redisRateLimitInstance = createRedisRateLimiterConnection()
  }

  return redisRateLimitInstance
}

export function getRedisForQueue() {
  if (!redisForQueueInstance) {
    redisForQueueInstance = createRedisBullMQConnection()
  }

  return redisForQueueInstance
}

export function createWorkerConnection() {
  return createRedisBullMQConnection()
}

export async function closeAllRedisConnections() {
  const targets = [redisCacheInstance, redisRateLimitInstance, redisForQueueInstance].filter(
    (connection): connection is NonNullable<typeof connection> => connection !== null,
  )

  await Promise.all(targets.map((connection) => connection.quit()))

  redisCacheInstance = null
  redisRateLimitInstance = null
  redisForQueueInstance = null
}
