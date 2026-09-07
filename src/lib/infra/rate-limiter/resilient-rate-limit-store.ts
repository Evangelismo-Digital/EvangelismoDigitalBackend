import type Redis from 'ioredis'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import {
  collectMetricsHttpRateLimitDegraded,
  collectMetricsHttpRateLimitRecovered,
} from '@lib/metrics/rate-limiter-metrics'
import { asLoggableError, OutageReporter } from './outage-reporter'

/**
 * WHY THIS EXISTS
 *
 * `@fastify/rate-limit` talks to Redis through a *store*. Its built-in Redis
 * store propagates any Redis failure to the request, and the plugin's only
 * answer is `skipOnError`: throw (HTTP 500 on every request while Redis blinks)
 * or swallow (no limit at all, silently). We had the first one. A `commandTimeout`
 * of 100 ms — deliberately aggressive, see `redis-rate-limiter-connection.ts` —
 * makes that a live hazard: a slow Redis takes the whole API down with it.
 *
 * Neither answer is acceptable for ingress limiting, so this store adds the third:
 * on a Redis failure it counts **in this process** instead, and says so. The API
 * stays up, the limit keeps being enforced (per instance rather than per cluster),
 * and every degraded request is counted in Prometheus and logged on a schedule.
 *
 * WHY IN-MEMORY FALLBACK IS RIGHT HERE AND WRONG IN `RedisRateLimiter`
 *
 * That class deliberately refuses an in-memory fallback (see its DESIGN DECISION
 * block) because it rations calls to *third-party* APIs: N instances each keeping
 * their own tally would blow a quota we do not own, so it fails closed. Ingress
 * limiting is the mirror image — the resource being protected is our own API, no
 * external quota can be breached by counting locally, and refusing traffic during
 * an infrastructure blip is precisely the outage we are trying to avoid. On the
 * single-instance VPS this deploys to, the local tally is in fact the whole tally.
 *
 * The store contract (`incr` / `child`) is public, typed API of the plugin. Note
 * that the published types are behind the implementation: the runtime also passes
 * `timeWindow` and `max` to `incr`, which is how any store learns the window. We
 * take them as optional and default the window defensively.
 */

/** Fixed-window state for one key. */
interface CountedWindow {
  count: number
  startedAt: number
}

export interface RateLimitStoreResult {
  current: number
  ttl: number
}

export type RateLimitStoreCallback = (error: Error | null, result?: RateLimitStoreResult) => void

/** The subset of the plugin's route options this store reads. */
export interface RateLimitChildRouteOptions {
  method?: string | string[]
  url?: string
  routeInfo?: { method?: string | string[]; url?: string }
  continueExceeding?: boolean
  exponentialBackoff?: boolean
}

/** Key prefix the plugin's own Redis store uses, kept so keys stay recognisable. */
const DEFAULT_KEY_PREFIX = 'fastify-rate-limit-'

/** Window used when the plugin does not pass one. One minute is its own default. */
const FALLBACK_TIME_WINDOW_MS = 60_000

/** Entries the in-process fallback will hold per store before evicting. */
const DEFAULT_MAX_FALLBACK_KEYS = 5_000

/**
 * Fixed window in one INCR+PEXPIRE round trip, so two concurrent requests cannot
 * interleave into a lost update. `PTTL` returning a negative value means the key
 * exists without an expiry — a torn write from an earlier crash — so the window
 * is re-armed rather than counted forever.
 */
const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  local ttl

  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  else
    ttl = redis.call('PTTL', KEYS[1])

    if ttl < 0 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
      ttl = tonumber(ARGV[1])
    end
  end

  return {current, ttl}
`

const RATE_LIMIT_COMMAND = 'httpRateLimitIncr'

type RateLimitCommand = (key: string, timeWindowMs: number) => Promise<[number, number]>

type RedisWithRateLimitCommand = Redis & { [RATE_LIMIT_COMMAND]?: RateLimitCommand }

/**
 * Counts in Redis. Shared by every instance of the app, and the source of truth
 * whenever it answers.
 */
export class RedisFixedWindowCounter {
  private readonly command: RateLimitCommand

  constructor(redis: Redis) {
    const client = redis as RedisWithRateLimitCommand

    // `defineCommand` is idempotent per client only if we make it so: the plugin
    // builds one store per route off the same connection.
    if (typeof client[RATE_LIMIT_COMMAND] !== 'function') {
      client.defineCommand(RATE_LIMIT_COMMAND, { numberOfKeys: 1, lua: RATE_LIMIT_LUA })
    }

    const command = client[RATE_LIMIT_COMMAND]

    if (typeof command !== 'function') {
      throw new TypeError(`ioredis não registrou o comando ${RATE_LIMIT_COMMAND}`)
    }

    this.command = command.bind(redis)
  }

  async incr(key: string, timeWindowMs: number): Promise<RateLimitStoreResult> {
    const [current, ttl] = await this.command(key, timeWindowMs)

    return { current, ttl }
  }
}

/**
 * Counts in this process. Only consulted while Redis is unavailable.
 *
 * Bounded on purpose: keys are caller-controlled (an IP per route), so an
 * unbounded map is a memory-exhaustion primitive handed to whoever is already
 * hammering the endpoint. Eviction is by insertion order, which for fixed windows
 * is also expiry order — the oldest window is the one closest to being irrelevant.
 */
export class LocalFixedWindowCounter {
  private readonly windows = new Map<string, CountedWindow>()

  constructor(private readonly maxKeys: number = DEFAULT_MAX_FALLBACK_KEYS) {}

  get size(): number {
    return this.windows.size
  }

  incr(key: string, timeWindowMs: number): RateLimitStoreResult {
    const now = Date.now()
    const existing = this.windows.get(key)

    if (existing && now - existing.startedAt < timeWindowMs) {
      existing.count += 1

      return { current: existing.count, ttl: timeWindowMs - (now - existing.startedAt) }
    }

    this.startWindow(key, now)

    return { current: 1, ttl: timeWindowMs }
  }

  /** Re-inserts so the key moves to the end of the eviction order. */
  private startWindow(key: string, now: number): void {
    this.windows.delete(key)

    if (this.windows.size >= this.maxKeys) {
      this.evictOldest()
    }

    this.windows.set(key, { count: 1, startedAt: now })
  }

  private evictOldest(): void {
    const oldest = this.windows.keys().next()

    // `done` is only true for an empty map, which the caller's size check already
    // excludes; the guard is here because `next().value` is typed as possibly
    // undefined, not because the branch is reachable. Stryker reports flipping it
    // as a survivor for that reason — an equivalent mutant, not a missing test.
    if (!oldest.done) {
      this.windows.delete(oldest.value)
    }
  }
}

/**
 * The plugin nests the route under `routeInfo` when it builds a child store, but
 * passes the bare route options in other paths; a method may also be an array.
 */
function routeIdentity(routeOptions: RateLimitChildRouteOptions): { method: string; url: string } {
  const route = routeOptions.routeInfo ?? routeOptions

  return { method: normalizeMethod(route.method), url: route.url ?? '' }
}

/** A route may be registered for several verbs at once. */
function normalizeMethod(method: string | string[] | undefined): string {
  return Array.isArray(method) ? method.join(',') : (method ?? '')
}

export interface ResilientRateLimitStoreDeps {
  redis: Redis
  reporter: OutageReporter
  keyPrefix?: string
  routeLabel?: string
  maxFallbackKeys?: number
}

/**
 * The store handed to `@fastify/rate-limit`. Redis first; this process second;
 * never an error to the request.
 */
export class ResilientRateLimitStore {
  private readonly redis: Redis
  private readonly reporter: OutageReporter
  private readonly keyPrefix: string
  private readonly routeLabel: string
  private readonly maxFallbackKeys: number

  private readonly remote: RedisFixedWindowCounter
  private readonly local: LocalFixedWindowCounter

  constructor(deps: ResilientRateLimitStoreDeps) {
    this.redis = deps.redis
    this.reporter = deps.reporter
    this.keyPrefix = deps.keyPrefix ?? DEFAULT_KEY_PREFIX
    this.routeLabel = deps.routeLabel ?? 'global'
    this.maxFallbackKeys = deps.maxFallbackKeys ?? DEFAULT_MAX_FALLBACK_KEYS

    this.remote = new RedisFixedWindowCounter(deps.redis)
    this.local = new LocalFixedWindowCounter(this.maxFallbackKeys)
  }

  incr(key: string, callback: RateLimitStoreCallback, timeWindowMs: number = FALLBACK_TIME_WINDOW_MS): void {
    const namespacedKey = this.keyPrefix + key

    void this.remote
      .incr(namespacedKey, timeWindowMs)
      .then((result) => {
        this.reporter.succeeded({ route: this.routeLabel })
        callback(null, result)
      })
      .catch((error: unknown) => {
        this.reporter.failed({ route: this.routeLabel }, asLoggableError(error))
        callback(null, this.local.incr(namespacedKey, timeWindowMs))
      })
  }

  /**
   * One store per route, so routes cannot consume each other's window — and one
   * shared reporter, because a Redis outage is one episode however many routes
   * notice it.
   */
  child(routeOptions: RateLimitChildRouteOptions): ResilientRateLimitStore {
    const { method, url } = routeIdentity(routeOptions)

    return new ResilientRateLimitStore({
      redis: this.redis,
      reporter: this.reporter,
      keyPrefix: `${this.keyPrefix}${method}${url}-`,
      routeLabel: `${method} ${url}`.trim() || this.routeLabel,
      maxFallbackKeys: this.maxFallbackKeys,
    })
  }
}

/** The reporter shape used for HTTP ingress limiting. */
function createRateLimitOutageReporter(): OutageReporter {
  return new OutageReporter({
    messages: {
      degraded: RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      stillDegraded: RATE_LIMITER_LOGS.HTTP_INFRA_STILL_DEGRADED,
      recovered: RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED,
    },
    onDegraded: ({ route }) => collectMetricsHttpRateLimitDegraded?.inc({ route: String(route) }),
    onRecovered: ({ route }) => collectMetricsHttpRateLimitRecovered?.inc({ route: String(route) }),
  })
}

/**
 * `@fastify/rate-limit` constructs the store itself (`new Store(globalParams)`)
 * and passes it nothing of ours, so the connection is bound in a closure here.
 */
export function resilientRateLimitStoreFor(redis: Redis): new () => ResilientRateLimitStore {
  const reporter = createRateLimitOutageReporter()

  return class BoundResilientRateLimitStore extends ResilientRateLimitStore {
    constructor() {
      super({ redis, reporter })
    }
  }
}
