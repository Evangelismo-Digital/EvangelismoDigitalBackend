import type Redis from 'ioredis'
import { env } from '@env/index'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import {
  collectMetricsHttpRateLimitDegraded,
  collectMetricsHttpRateLimitRecovered,
  collectMetricsHttpRateLimitRedisUp,
} from '@lib/metrics/rate-limiter-metrics'
import { asLoggableError, OutageReporter } from './outage-reporter'

/**
 * WHY THIS EXISTS
 *
 * The HTTP limiter runs with `skipOnError: true`: Redis is the single source of
 * truth, and when it cannot answer the limit is skipped rather than turned into
 * an HTTP 500. That is the right trade for ingress — the limiter must not become
 * the availability risk it exists to prevent — but it is only acceptable while
 * the skipping is *visible*. `@fastify/rate-limit` swallows the store error
 * silently and offers no hook on it, so the degraded state has to be observed
 * from outside the request path.
 *
 * Hence this probe: one `PING` on the rate-limiter connection, on a bounded
 * interval, publishing the state to Prometheus.
 *
 * WHY IT PINGS ON THE RATE LIMITER'S OWN CONNECTION
 *
 * Because that connection is deliberately impatient — `commandTimeout: 100`,
 * `enableOfflineQueue: false`, `maxRetriesPerRequest: 0` — the probe inherits
 * exactly the conditions a real rate-limit command faces. A separate, more
 * forgiving client would report "Redis is up" during precisely the incident this
 * exists to catch: a Redis that is reachable but too slow to answer within the
 * budget, which is what took the API down on 2026-09-07. The probe fails when
 * rate limiting would fail, because it fails the same way.
 *
 * COST
 *
 * One PING per interval (15 s by default, `REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS`,
 * bounded by the env schema). That is deliberately far less aggressive than
 * per-request instrumentation: negligible CPU, network and Redis load, no
 * per-request latency, and nothing that grows with traffic.
 */

/** What the probe needs from the connection. Keeps the double honest. */
export interface RateLimitHealthProbeClient {
  ping: () => Promise<string>
}

export interface RateLimitHealthProbeOptions {
  redis: RateLimitHealthProbeClient
  intervalMs?: number
  reporter?: OutageReporter
}

const SUBSYSTEM = { subsystem: 'http-rate-limit' } as const

/** The reporter shape for ingress rate limiting. */
function createProbeReporter(): OutageReporter {
  return new OutageReporter({
    messages: {
      degraded: RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      stillDegraded: RATE_LIMITER_LOGS.HTTP_INFRA_STILL_DEGRADED,
      recovered: RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED,
    },
    onDegraded: () => collectMetricsHttpRateLimitDegraded?.inc(SUBSYSTEM),
    onRecovered: () => collectMetricsHttpRateLimitRecovered?.inc(SUBSYSTEM),
  })
}

/**
 * Publishes whether Redis can currently serve ingress rate limiting.
 *
 * Deliberately not a rate limiter, a counter or a cache: it decides nothing about
 * any request. It only answers the operator's question — "is the limit being
 * enforced right now?" — as `http_rate_limit_redis_up`.
 */
export class RateLimitHealthProbe {
  private readonly redis: RateLimitHealthProbeClient
  private readonly intervalMs: number
  private readonly reporter: OutageReporter

  private timer: NodeJS.Timeout | null = null

  constructor(options: RateLimitHealthProbeOptions) {
    this.redis = options.redis
    this.intervalMs = options.intervalMs ?? env.REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS
    this.reporter = options.reporter ?? createProbeReporter()
  }

  get degraded(): boolean {
    return this.reporter.degraded
  }

  /**
   * Probes once immediately so the gauge has a value before the first scrape,
   * then on the interval. Starting twice is a no-op rather than a second timer.
   */
  start(): void {
    if (this.timer !== null) {
      return
    }

    // `unref` so a probe that is still waiting can never be the reason the
    // process refuses to exit.
    this.timer = setInterval(() => void this.check(), this.intervalMs)
    this.timer.unref()

    void this.check()
  }

  stop(): void {
    // No guard: `clearInterval(undefined)` is a no-op, so stopping a probe that
    // never started needs no branch — and a branch no input can distinguish is a
    // permanent mutation-test survivor rather than a safety net.
    clearInterval(this.timer ?? undefined)

    this.timer = null
    this.reporter.reset()
  }

  /** One observation. Never rejects: a probe that throws is a probe that lies. */
  async check(): Promise<boolean> {
    try {
      await this.redis.ping()

      collectMetricsHttpRateLimitRedisUp?.set(SUBSYSTEM, 1)
      this.reporter.succeeded(SUBSYSTEM)

      return true
    } catch (error) {
      collectMetricsHttpRateLimitRedisUp?.set(SUBSYSTEM, 0)
      this.reporter.failed(SUBSYSTEM, asLoggableError(error))

      return false
    }
  }
}

/** Binds a probe to the live rate-limiter connection. */
export function rateLimitHealthProbeFor(redis: Redis): RateLimitHealthProbe {
  return new RateLimitHealthProbe({ redis })
}
