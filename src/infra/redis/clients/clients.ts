import { createRedisBullMQConnection } from '../connections/redis-bullMQ-connection'
import { createRedisCacheConnection } from '../connections/redis-cache-connection'
import { createRedisRateLimiterConnection } from '../connections/redis-rate-limiter-connection'
import {
  createOutboxPublisherConnection,
  createOutboxSubscriberConnection,
} from '../connections/redis-outbox-signal-connection'

let redisCacheInstance: ReturnType<typeof createRedisCacheConnection> | null = null
let redisRateLimitInstance: ReturnType<typeof createRedisRateLimiterConnection> | null = null
let redisForQueueInstance: ReturnType<typeof createRedisBullMQConnection> | null = null
let redisOutboxPublisherInstance: ReturnType<typeof createOutboxPublisherConnection> | null = null
let redisOutboxSubscriberInstance: ReturnType<typeof createOutboxSubscriberConnection> | null = null

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

export function getOutboxPublisher() {
  redisOutboxPublisherInstance ??= createOutboxPublisherConnection()
  return redisOutboxPublisherInstance
}

export function getOutboxSubscriber() {
  redisOutboxSubscriberInstance ??= createOutboxSubscriberConnection()
  return redisOutboxSubscriberInstance
}

export async function closeAllRedisConnections() {
  const targets = [
    redisCacheInstance,
    redisRateLimitInstance,
    redisForQueueInstance,
    redisOutboxPublisherInstance,
    redisOutboxSubscriberInstance,
  ].filter((connection): connection is NonNullable<typeof connection> => connection !== null)

  redisCacheInstance = null
  redisRateLimitInstance = null
  redisForQueueInstance = null
  redisOutboxPublisherInstance = null
  redisOutboxSubscriberInstance = null

  await Promise.allSettled(
    targets.map((connection) => (connection.status === 'end' ? Promise.resolve() : connection.quit())),
  )
}
