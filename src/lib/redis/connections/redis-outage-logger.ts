import { env } from '@env/index'
import { logger } from '@lib/logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

type ErrorLike = {
  message?: string
  name?: string
  code?: string
  stack?: string
}

/** The connections that report outages; each gets its own log label. */
export type RedisSubsystem = 'cache' | 'rate-limiter' | 'bullmq'

type RedisOutageLoggerConfig = {
  subsystem: RedisSubsystem
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

/**
 * Phrases ioredis puts in the message when the code is absent — a disconnect
 * mid-command, a replica rejecting a write, an unauthenticated reconnect.
 */
const CONNECTIVITY_ERROR_PHRASES = ['ECONNREFUSED', 'CONNECTION IS CLOSED', 'READONLY', 'ETIMEDOUT', 'NOAUTH']

export function isRedisConnectivityError(error: unknown): boolean {
  const err = (error ?? {}) as ErrorLike
  const message = (err.message ?? '').toUpperCase()
  const code = (err.code ?? '').toUpperCase()

  return CONNECTIVITY_ERROR_CODES.has(code) || CONNECTIVITY_ERROR_PHRASES.some((phrase) => message.includes(phrase))
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

    if (this.outageStartedAt === null) {
      this.startOutage(now, event, error)
      return
    }

    if (now - this.lastWarnAt >= this.intervalMs) {
      this.reportOngoingOutage(now, event, error)
      return
    }

    this.suppressedEvents += 1
  }

  /** The connection went from healthy to degraded: always worth one log line. */
  private startOutage(now: number, event: 'error' | 'close', error?: unknown): void {
    this.outageStartedAt = now
    this.lastWarnAt = now
    this.suppressedEvents = 0

    logger.warn({ ...this.identity(), event, err: error }, REDIS_LOGS.CONNECTION_DEGRADED)
  }

  /**
   * Still degraded, and the quiet period has elapsed. Reports how long the
   * outage has run and how many events were swallowed meanwhile, so the rate
   * limiting never hides the scale of the problem.
   */
  private reportOngoingOutage(now: number, event: 'error' | 'close', error?: unknown): void {
    logger.warn(
      {
        ...this.identity(),
        event,
        err: error,
        outageDurationMs: now - (this.outageStartedAt ?? now),
        suppressedEvents: this.suppressedEvents,
      },
      REDIS_LOGS.CONNECTION_STILL_DEGRADED,
    )

    this.lastWarnAt = now
    this.suppressedEvents = 0
  }

  private identity() {
    return {
      subsystem: this.config.subsystem,
      redisHost: this.config.host,
      redisPort: this.config.port,
    }
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
