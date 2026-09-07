import { createRedisBullMQConnection } from '../connections/redis-bullMQ-connection'
import { createRedisCacheConnection } from '../connections/redis-cache-connection'
import { createRedisRateLimiterConnection } from '../connections/redis-rate-limiter-connection'

let redisCacheInstance: ReturnType<typeof createRedisCacheConnection> | null = null
let redisRateLimitInstance: ReturnType<typeof createRedisRateLimiterConnection> | null = null
let redisForQueueInstance: ReturnType<typeof createRedisBullMQConnection> | null = null

export function getRedisCache() {
  redisCacheInstance ??= createRedisCacheConnection()

  return redisCacheInstance
}

export function getRedisRateLimit() {
  redisRateLimitInstance ??= createRedisRateLimiterConnection()

  return redisRateLimitInstance
}

export function getRedisForQueue() {
  redisForQueueInstance ??= createRedisBullMQConnection()

  return redisForQueueInstance
}

export function createWorkerConnection() {
  return createRedisBullMQConnection()
}

export async function closeAllRedisConnections() {
  const targets = [redisCacheInstance, redisRateLimitInstance, redisForQueueInstance].filter(
    (connection): connection is NonNullable<typeof connection> => connection !== null,
  )

  // Detach BEFORE awaiting the quits, not after. A `getRedisCache()` arriving
  // while they are in flight would otherwise build a fresh connection that the
  // assignments then orphan: never quit, not in `targets`, and invisible to the
  // next shutdown — a leaked socket that keeps the process alive.
  redisCacheInstance = null
  redisRateLimitInstance = null
  redisForQueueInstance = null

  await Promise.allSettled(
    targets.map((connection) => (connection.status === 'end' ? Promise.resolve() : connection.quit())),
  )
}
