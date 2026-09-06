import Redis from 'ioredis'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { isRedisConnectivityError, RedisOutageLogger, RedisSubsystem } from './redis-outage-logger'

/**
 * Wires a connection's outage reporting.
 *
 * All three connections — cache, rate limiter and BullMQ — handled these four
 * events identically and differed only in the subsystem label and the message
 * used for an unexpected error, so the block was copied verbatim three times.
 * Keeping it in one place means a change to how outages are reported cannot
 * land on two of the three by accident.
 */
export function attachOutageLogging(redis: Redis, subsystem: RedisSubsystem, unexpectedErrorMessage: string): void {
  const outageLogger = new RedisOutageLogger({
    subsystem,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  })

  redis.on('ready', () => {
    outageLogger.onRecovery()
  })

  redis.on('connect', () => {
    outageLogger.onRecovery()
  })

  redis.on('close', () => {
    outageLogger.onOutage('close')
  })

  redis.on('error', (error) => {
    reportError(outageLogger, subsystem, unexpectedErrorMessage, error)
  })
}

/**
 * A connectivity error is the expected shape of an outage and is rate-limited by
 * the outage logger; anything else is a genuine surprise and is logged in full.
 */
function reportError(
  outageLogger: RedisOutageLogger,
  subsystem: RedisSubsystem,
  unexpectedErrorMessage: string,
  error: Error,
): void {
  if (isRedisConnectivityError(error)) {
    outageLogger.onOutage('error', error)
    return
  }

  logger.error(
    {
      subsystem,
      redisHost: env.REDIS_HOST,
      redisPort: env.REDIS_PORT,
      err: error,
    },
    unexpectedErrorMessage,
  )
}
