import { env } from '@config/env/index'
import Redis from 'ioredis'
import { attachOutageLogging } from './attach-outage-logging'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'
import { logger } from '@infra/logger'

const baseConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  family: 4, // force IPv4
}

const RECONNECT_BACKOFF_STEP_MS = 100
const RECONNECT_BACKOFF_MAX_MS = 5_000

export function createOutboxPublisherConnection() {
  const redis = new Redis({
    ...baseConfig,
    enableOfflineQueue: true,
    commandTimeout: 2000,
  })

  attachOutageLogging(redis, 'outbox-publisher', OUTBOX_LOGS.PUBLISHER_ERROR)

  return redis
}

export function createOutboxSubscriberConnection() {
  const redis = new Redis({
    ...baseConfig,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      const delay = Math.min(Math.pow(2, times) * RECONNECT_BACKOFF_STEP_MS, RECONNECT_BACKOFF_MAX_MS)
      logger.warn({ times, delay }, 'Reconnecting outbox subscriber...')
      return delay
    },
  })

  attachOutageLogging(redis, 'outbox-subscriber', OUTBOX_LOGS.SUBSCRIBER_ERROR)

  return redis
}
