import { env } from '@env/index'
import { logger } from '@lib/logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

type ErrorLike = {
  message?: string
  name?: string
  code?: string
  stack?: string
}

type RedisOutageLoggerConfig = {
  subsystem: 'cache' | 'rate-limiter' | 'bullmq'
  host: string
  port: number
}

const CONNECTIVITY_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
])

export function isRedisConnectivityError(error: unknown): boolean {
  const err = (error ?? {}) as ErrorLike
  const message = (err.message ?? '').toUpperCase()
  const code = (err.code ?? '').toUpperCase()

  if (CONNECTIVITY_ERROR_CODES.has(code)) {
    return true
  }

  return (
    message.includes('ECONNREFUSED') ||
    message.includes('CONNECTION IS CLOSED') ||
    message.includes('READONLY') ||
    message.includes('ETIMEDOUT') ||
    message.includes('NOAUTH')
  )
}

export class RedisOutageLogger {
  private readonly intervalMs: number
  private outageStartedAt: number | null = null
  private lastWarnAt = 0
  private suppressedEvents = 0

  constructor(private readonly config: RedisOutageLoggerConfig) {
    this.intervalMs = env.REDIS_LOG_OUTAGE_INTERVAL_MS
  }

  onOutage(event: 'error' | 'close', error?: unknown) {
    const now = Date.now()
    const err = (error ?? {}) as ErrorLike

    if (this.outageStartedAt === null) {
      this.outageStartedAt = now
      this.lastWarnAt = now
      this.suppressedEvents = 0

      logger.warn(
        {
          subsystem: this.config.subsystem,
          redisHost: this.config.host,
          redisPort: this.config.port,
          event,
          errorCode: err.code,
          errorName: err.name,
          errorMessage: err.message,
        },
        REDIS_LOGS.CONNECTION_DEGRADED,
      )

      return
    }

    if (now - this.lastWarnAt >= this.intervalMs) {
      logger.warn(
        {
          subsystem: this.config.subsystem,
          redisHost: this.config.host,
          redisPort: this.config.port,
          event,
          errorCode: err.code,
          errorName: err.name,
          errorMessage: err.message,
          outageDurationMs: now - this.outageStartedAt,
          suppressedEvents: this.suppressedEvents,
        },
        REDIS_LOGS.CONNECTION_STILL_DEGRADED,
      )

      this.lastWarnAt = now
      this.suppressedEvents = 0
      return
    }

    this.suppressedEvents += 1
  }

  onRecovery() {
    if (this.outageStartedAt === null) {
      return
    }

    const now = Date.now()

    logger.info(
      {
        subsystem: this.config.subsystem,
        redisHost: this.config.host,
        redisPort: this.config.port,
        outageDurationMs: now - this.outageStartedAt,
        suppressedEvents: this.suppressedEvents,
      },
      REDIS_LOGS.CONNECTION_RECOVERED,
    )

    this.outageStartedAt = null
    this.lastWarnAt = 0
    this.suppressedEvents = 0
  }
}
