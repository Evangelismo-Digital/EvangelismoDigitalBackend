import { logger } from '@lib/logger'

/** How often a continuing outage is re-logged, so it does not flood. */
export const DEFAULT_OUTAGE_WARN_INTERVAL_MS = 30_000

interface OutageReporterMessages {
  /** First request of an episode to fall back. */
  degraded: string
  /** Periodic reminder while the episode continues. */
  stillDegraded: string
  /** First request to succeed again. */
  recovered: string
}

export interface OutageReporterOptions {
  messages: OutageReporterMessages
  warnIntervalMs?: number
  /**
   * Called on **every** degraded request, unlike the log, which is throttled:
   * each one is a real event (a request served without the shared limit), and a
   * counter that skipped the suppressed ones would understate the blast radius.
   */
  onDegraded?: (context: Record<string, unknown>) => void
  /** Called once per episode, on the transition back to healthy. */
  onRecovered?: (context: Record<string, unknown>) => void
}

/**
 * Tracks one "the backing store is unavailable, we are running degraded"
 * episode and reports it without flooding the log.
 *
 * Extracted from `RedisRateLimiter`, which needed exactly this and is now one of
 * two callers — the HTTP rate-limit store is the other. The two report different
 * subjects (an outbound provider vs. an inbound route), so the caller supplies
 * both the log messages and the context object; only the throttling, the episode
 * boundaries and the suppressed-log accounting live here.
 *
 * Not thread-shared state by accident: an instance *is* the episode. Callers that
 * want one episode across many limiters share one reporter; callers that want
 * independent episodes construct one each.
 */
export class OutageReporter {
  private startedAt: number | null = null
  private lastWarnAt = 0
  private suppressedLogs = 0

  private readonly warnIntervalMs: number

  constructor(private readonly options: OutageReporterOptions) {
    this.warnIntervalMs = options.warnIntervalMs ?? DEFAULT_OUTAGE_WARN_INTERVAL_MS
  }

  /** True while an episode is open. Exposed for callers that report health. */
  get degraded(): boolean {
    return this.startedAt !== null
  }

  /** Record a request that had to fall back. Always counts; logs on a schedule. */
  failed(context: Record<string, unknown>, error: Record<string, unknown>): void {
    this.options.onDegraded?.(context)

    const now = Date.now()

    if (this.startedAt === null) {
      this.startEpisode(context, error, now)
      return
    }

    if (now - this.lastWarnAt >= this.warnIntervalMs) {
      this.warnStillDegraded(context, error, now)
      return
    }

    this.suppressedLogs += 1
  }

  /** Record a request that succeeded. Closes the episode if one was open. */
  succeeded(context: Record<string, unknown>): void {
    if (this.startedAt === null) {
      return
    }

    this.options.onRecovered?.(context)

    logger.info(
      {
        ...context,
        outageDurationMs: Date.now() - this.startedAt,
        suppressedLogs: this.suppressedLogs,
      },
      this.options.messages.recovered,
    )

    this.reset()
  }

  /** Drops any open episode without logging a recovery. For teardown only. */
  reset(): void {
    this.startedAt = null
    this.lastWarnAt = 0
    this.suppressedLogs = 0
  }

  private startEpisode(context: Record<string, unknown>, error: Record<string, unknown>, now: number): void {
    this.startedAt = now
    this.lastWarnAt = now
    this.suppressedLogs = 0

    logger.warn({ ...context, mode: 'fail-open', redisOutage: true, err: error }, this.options.messages.degraded)
  }

  private warnStillDegraded(context: Record<string, unknown>, error: Record<string, unknown>, now: number): void {
    logger.warn(
      {
        ...context,
        mode: 'fail-open',
        redisOutage: true,
        outageDurationMs: now - (this.startedAt ?? now),
        suppressedLogs: this.suppressedLogs,
        err: error,
      },
      this.options.messages.stillDegraded,
    )

    this.lastWarnAt = now
    this.suppressedLogs = 0
  }
}

/** Narrows an unknown rejection to something loggable. */
export function asLoggableError(error: unknown): Record<string, unknown> {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : { error }
}
