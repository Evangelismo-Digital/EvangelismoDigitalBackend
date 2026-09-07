import crypto from 'node:crypto'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { CACHE_LOGS } from 'messages/constants/logs/cache'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'
import {
  bulkhead,
  circuitBreaker,
  wrap,
  handleWhenResult,
  SamplingBreaker,
  BulkheadRejectedError,
  BrokenCircuitError,
  BulkheadPolicy,
  IPolicy,
} from 'cockatiel'
import {
  collectMetricsCacheHits,
  collectMetricsCacheMisses,
  collectMetricsCacheErrors,
  collectMetricsCachePendingFetches,
  collectMetricsCacheFetchDuration,
  collectMetricsCacheCircuitBreakerTrips,
} from '@lib/metrics/cache-metrics'
import { byCodeUnit } from 'core/shared/stable-order'
import { CacheFailurePolicy, SerializedError } from './cache-failure-policy'

/** Concurrent shared fetches allowed before the bulkhead starts rejecting. */
const DEFAULT_MAX_PENDING_FETCHES = 1_000

/** +/- 5 % on every TTL, so a batch written together does not expire together. */
const DEFAULT_TTL_JITTER_PERCENTAGE = 0.05

/**
 * Circuit-breaker settings for the shared fetch.
 *
 * Passed in rather than read from env here, so the cache stays a pure
 * collaborator its tests can configure directly; the composition root supplies
 * the real numbers. Omitting the whole object builds the stack *without* a
 * breaker rather than with a disabled one.
 */
export interface CacheCircuitBreakerOptions {
  failureThreshold: number
  samplingWindowMs: number
  minimumThroughput: number
  halfOpenAfterMs: number
}

export interface ResilientCacheOptions<E = unknown> {
  prefix: string
  defaultTtlSeconds: number
  negativeTtlSeconds: number
  maxPendingFetches?: number
  circuitBreaker?: CacheCircuitBreakerOptions
  /**
   * Ceiling for the shared fetch behind one key.
   *
   * Required, deliberately. Every other layer here derives its timeout from the
   * budget it was given; a cache that cannot say how long its fetch may take
   * has no business inventing a number, and the previous silent 12s default was
   * longer than the whole request budget it now sits inside.
   */
  fetchTimeoutMs: number
  ttlJitterPercentage?: number
  serializeError?: (error: E) => { type: string; message: string; data?: unknown }
  deserializeError?: (type: string, message: string, data?: unknown) => E
  isRetryable?: (error: E) => boolean
  /**
   * Per-error negative TTL. Lets a caller keep a genuinely permanent failure
   * (an invalid CEP, say — which shields an upstream API from being re-asked)
   * far longer than one that may resolve itself. Falls back to
   * `negativeTtlSeconds`; returning 0 skips the write entirely.
   */
  negativeTtlFor?: (error: E) => number
}

// === Cache Envelope Structure ===
export interface CacheEnvelope<T> {
  s: boolean // state: true (Success), false (Failure)
  v?: T // value: Exists only if s=true
  /** error: Exists only if s=false. See {@link SerializedError}. */
  e?: SerializedError
}

/**
 * One in-flight fetch, shared by every caller asking for the same key.
 *
 * It carries its own **detached** deadline: the work belongs to the cache, not
 * to whichever caller happened to arrive first. That is what stops one caller's
 * cancellation from killing a fetch others are still waiting on.
 */
interface PendingFetch {
  promise: Promise<Result<unknown, unknown>>
  deadline: Deadline
}

/**
 * Resolves the moment `deadline` expires, and never rejects.
 *
 * Used to race a caller against its own budget without disturbing the work it
 * is waiting on. `cleanup()` releases the listener when the race is decided the
 * other way, so a long-lived parent deadline does not accumulate them.
 */
function whenExpired(deadline: Deadline): { promise: Promise<void>; cleanup: () => void } {
  let onAbort: (() => void) | undefined

  const promise = new Promise<void>((resolve) => {
    if (deadline.expired) {
      resolve()
      return
    }

    onAbort = () => {
      resolve()
    }
    deadline.signal.addEventListener('abort', onAbort, { once: true })
  })

  return {
    promise,
    cleanup: () => {
      if (onAbort) {
        deadline.signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

/**
 * Awaits `work`, giving up if `deadline` expires first.
 *
 * Returns `undefined` on expiry — Redis commands take no signal, so the command
 * itself runs on, but the caller stops paying for it.
 */
async function withinBudget<T>(work: Promise<T>, deadline: Deadline): Promise<T | undefined> {
  const expiry = whenExpired(deadline)

  try {
    return await Promise.race([work, expiry.promise.then(() => undefined)])
  } finally {
    expiry.cleanup()
  }
}

export class ResilientCache<E = unknown> {
  private readonly pendingFetches = new Map<string, PendingFetch>()

  private readonly MAX_PENDING: number
  private readonly FETCH_TIMEOUT: number
  private readonly JITTER_PERCENTAGE: number

  /** Concurrency limit on *shared fetches*, not on callers. */
  /** What a failure means, whether it is worth caching, and for how long. */
  private readonly failures: CacheFailurePolicy<E>
  private readonly limiter: BulkheadPolicy
  private readonly fetchPolicy: IPolicy

  constructor(
    private readonly redis: Redis,
    private readonly options: ResilientCacheOptions<E>,
  ) {
    this.failures = new CacheFailurePolicy<E>(options)
    this.MAX_PENDING = options.maxPendingFetches ?? DEFAULT_MAX_PENDING_FETCHES
    this.FETCH_TIMEOUT = options.fetchTimeoutMs
    this.JITTER_PERCENTAGE = options.ttlJitterPercentage ?? DEFAULT_TTL_JITTER_PERCENTAGE

    this.limiter = bulkhead(this.MAX_PENDING)
    this.fetchPolicy = this.composeFetchPolicy()
  }

  /**
   * Breaker outermost, bulkhead inside: an open circuit then rejects without
   * first occupying a concurrency slot it has no intention of using.
   *
   * The breaker counts *returned* failures, because `executeFetch` reports
   * trouble as `err(...)` rather than by throwing — and it counts only the
   * retryable ones. A NOT_FOUND is a real answer, and an ABORTED request says
   * the caller left; treating either as a fault would suspend a healthy
   * pipeline. A bulkhead rejection cannot trip it either: cockatiel rethrows
   * errors its filter does not handle, so they never reach the breaker's tally.
   */
  private composeFetchPolicy(): IPolicy {
    const settings = this.options.circuitBreaker

    if (!settings) {
      return this.limiter
    }

    const breaker = circuitBreaker(
      handleWhenResult((result) => this.countsAsBreakerFailure(result as Result<unknown, E>)),
      {
        halfOpenAfter: settings.halfOpenAfterMs,
        breaker: new SamplingBreaker({
          threshold: settings.failureThreshold,
          duration: settings.samplingWindowMs,
          minimumRps: settings.minimumThroughput,
        }),
      },
    )

    return wrap(breaker, this.limiter)
  }

  private countsAsBreakerFailure(result: Result<unknown, E>): boolean {
    return isErr(result) && this.failures.isRetryable(result.error)
  }

  generateKey(params: Record<string, unknown>): string {
    const stableString = Object.keys(params)
      .filter((k) => params[k] != null && params[k] !== '')
      .sort(byCodeUnit)
      .map((k) => `${k}:${String(params[k])}`)
      .join('|')

    const hash = crypto.createHash('sha256').update(stableString).digest('hex')

    return `${this.options.prefix}${hash}`
  }

  /**
   * Serves `key` from cache, or runs `fetcher` once and remembers the answer.
   *
   * `parentDeadline` is this caller's own budget. Every Redis round-trip and
   * the fetch itself are bounded by it, so the whole call cannot outlast the
   * budget it was given — and, crucially, a caller can only ever cancel *its
   * own* wait: the shared fetch belongs to the cache.
   */
  async getOrFetch<T>(
    key: string,
    fetcher: (deadline: Deadline) => Promise<Result<T, E>>,
    parentDeadline: Deadline = Deadline.none(),
  ): Promise<Result<T, E | AppError>> {
    if (parentDeadline.expired) {
      return err(parentDeadline.asError())
    }

    const served = await this.serveWithoutFetching<T>(key, parentDeadline)
    if (served) {
      return served
    }

    return await this.startFetch<T>(key, fetcher, parentDeadline)
  }

  /**
   * Everything that can answer without starting new work: an in-flight fetch to
   * join, or a stored envelope. Returns `null` when only a fetch will do.
   */
  private async serveWithoutFetching<T>(key: string, deadline: Deadline): Promise<Result<T, E | AppError> | null> {
    // Fast path: someone is already fetching this key.
    const joined = await this.tryJoinPendingFetch<T>(key, deadline)
    if (joined) {
      return joined
    }

    const hit = await this.readHit<T>(key, deadline)
    if (hit) {
      return hit
    }

    return null
  }

  /** Attaches to an in-flight fetch for `key`, or `null` if there is none. */
  private async tryJoinPendingFetch<T>(key: string, callerDeadline: Deadline): Promise<Result<T, E | AppError> | null> {
    const pending = this.pendingFetches.get(key)

    if (!pending) {
      return null
    }

    return await this.raceCaller<T>(pending.promise as Promise<Result<T, E | AppError>>, callerDeadline)
  }

  /**
   * Starts the one shared fetch for `key`.
   *
   * The fetch runs under a deadline of its own, detached from every caller, and
   * is deregistered only when it settles — never when a caller walks away, or a
   * later arrival would start a duplicate against the same upstream.
   */
  private async startFetch<T>(
    key: string,
    fetcher: (deadline: Deadline) => Promise<Result<T, E>>,
    callerDeadline: Deadline,
  ): Promise<Result<T, E | AppError>> {
    // Re-check before registering. `serveWithoutFetching` awaited Redis, so a
    // fetch may have started meanwhile. This read is deliberately synchronous:
    // it and the `set` below run in one microtask with no await between them,
    // which is what makes single-flight airtight.
    const startedDuringRead = this.pendingFetches.get(key)
    if (startedDuringRead) {
      return await this.raceCaller<T>(startedDuringRead.promise as Promise<Result<T, E | AppError>>, callerDeadline)
    }

    collectMetricsCacheMisses?.inc({ prefix: this.options.prefix })

    const fetchDeadline = Deadline.in(this.FETCH_TIMEOUT)
    const shared = this.guardedFetch<T>(key, fetcher, fetchDeadline)

    this.pendingFetches.set(key, { promise: shared, deadline: fetchDeadline })
    this.reportPendingSize()

    void shared
      .catch(() => undefined)
      .finally(() => {
        this.pendingFetches.delete(key)
        this.reportPendingSize()
      })

    return await this.raceCaller<T>(shared, callerDeadline)
  }

  /**
   * The shared fetch, behind the concurrency limit and the breaker.
   *
   * The guard sits here — around the one shared fetch — rather than around each
   * caller. Callers that merely join an in-flight fetch, or that are answered
   * from Redis, cost the upstream nothing and must not consume a slot; putting
   * the bulkhead at the entry point would count them and quietly shrink the
   * effective limit to "callers" instead of "fetches".
   */
  private async guardedFetch<T>(
    key: string,
    fetcher: (deadline: Deadline) => Promise<Result<T, E>>,
    fetchDeadline: Deadline,
  ): Promise<Result<T, E | AppError>> {
    try {
      return await this.fetchPolicy.execute(() => this.executeFetch<T>(key, fetcher, fetchDeadline))
    } catch (error) {
      return this.mapPolicyRejection(error, fetchDeadline)
    }
  }

  /**
   * Translates a refusal by the limiter or the breaker into this cache's
   * vocabulary.
   *
   * `executeFetch` is total — it converts every throw into an `err(...)` — so
   * the only errors that can reach here are the policies' own rejections. The
   * final fallback is therefore defensive, and mutating the `BrokenCircuitError`
   * check to `true` survives mutation testing as an equivalent mutant. It is
   * kept rather than removed so that an unexpected throw still returns a Result
   * instead of escaping as a rejection.
   */
  private mapPolicyRejection(error: unknown, fetchDeadline: Deadline): Result<never, AppError> {
    if (error instanceof BulkheadRejectedError) {
      collectMetricsCacheCircuitBreakerTrips?.inc({ prefix: this.options.prefix })
      return err(new InfraServiceOverloadError())
    }

    if (error instanceof BrokenCircuitError) {
      collectMetricsCacheCircuitBreakerTrips?.inc({ prefix: this.options.prefix })
      return err(new CircuitOpenError(this.options.prefix, error))
    }

    return this.mapFetchThrow(error, fetchDeadline)
  }

  /**
   * Waits on the shared fetch, but only for as long as *this* caller's budget
   * allows. Giving up here neither cancels the fetch nor affects anyone else.
   */
  private async raceCaller<T>(
    shared: Promise<Result<T, E | AppError>>,
    callerDeadline: Deadline,
  ): Promise<Result<T, E | AppError>> {
    const expiry = whenExpired(callerDeadline)

    try {
      const outcome = await Promise.race([
        shared.then((value) => ({ settled: true, value }) as const),
        expiry.promise.then(() => ({ settled: false }) as const),
      ])

      return outcome.settled ? outcome.value : err(callerDeadline.asError())
    } finally {
      expiry.cleanup()
    }
  }

  private reportPendingSize(): void {
    collectMetricsCachePendingFetches?.set({ prefix: this.options.prefix }, this.pendingFetches.size)
  }

  /**
   * Runs the fetcher under the shared budget.
   *
   * A fetcher that honours its deadline settles on its own; racing the budget
   * as well guarantees settlement even for one that ignores it, so a hung
   * upstream cannot pin an entry in `pendingFetches` forever. Both use the
   * deadline's single timer — there is no second clock.
   */
  private async executeFetch<T>(
    key: string,
    fetcher: (deadline: Deadline) => Promise<Result<T, E>>,
    fetchDeadline: Deadline,
  ): Promise<Result<T, E | AppError>> {
    const endTimer = collectMetricsCacheFetchDuration?.startTimer({ prefix: this.options.prefix })
    const expiry = whenExpired(fetchDeadline)

    try {
      const outcome = await Promise.race([
        fetcher(fetchDeadline).then((value) => ({ settled: true, value }) as const),
        expiry.promise.then(() => ({ settled: false }) as const),
      ])

      if (!outcome.settled) {
        return err(fetchDeadline.asError())
      }

      // The fetcher produced an answer, so we keep it — and cache it — even if
      // the clock ran out while it was landing. A deadline stops us starting or
      // waiting on work; it never discards work already finished and paid for.
      return await this.cacheAndReturn(key, outcome.value)
    } catch (error) {
      return this.mapFetchThrow(error, fetchDeadline)
    } finally {
      endTimer?.()
      expiry.cleanup()
      fetchDeadline.dispose()
    }
  }

  private mapFetchThrow(error: unknown, fetchDeadline: Deadline): Result<never, AppError> {
    if (fetchDeadline.expired) {
      return err(fetchDeadline.asError())
    }

    // An AppError has already been classified by the layer that raised it —
    // its failureMode and telemetry reason are the ones callers route on, so
    // re-wrapping it as a generic provider failure would throw that away.
    if (error instanceof AppError) {
      return err(error)
    }

    return err(new ProviderFailureError(error))
  }

  private async readHit<T>(key: string, deadline: Deadline): Promise<Result<T, E | AppError> | null> {
    const envelope = await this.readEnvelope<T>(key, deadline)

    return envelope ? this.unwrapEnvelope<T>(key, envelope) : null
  }

  /** Reads and parses the envelope at `key`. Any failure is a miss, never a throw. */
  private async readEnvelope<T>(key: string, deadline: Deadline): Promise<CacheEnvelope<T> | null> {
    const cached = await this.readRaw(key, deadline)

    if (!cached) {
      return null
    }

    try {
      return JSON.parse(cached) as CacheEnvelope<T>
    } catch (error) {
      // Named `error`, not `err`: this module imports `err` from
      // core/shared/result, and a `catch (err)` shadows it — a later
      // `return err(...)` inside one of these blocks would call the caught
      // Error object instead of the Result constructor.
      // Corrupted payload — proceed to fetch
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: 'corrupted' })
      logger.warn({ err: error, key }, CACHE_LOGS.READ_ERROR)
      return null
    }
  }

  /** The Redis GET, bounded by the caller's budget so a slow cache cannot eat it. */
  private async readRaw(key: string, deadline: Deadline): Promise<string | null | undefined> {
    const readDeadline = deadline.derive(CACHE_CONFIG.REDIS_OP_BUDGET_MS)

    try {
      return await withinBudget(this.redis.get(key), readDeadline)
    } catch (error) {
      // Swallow Redis connection errors and proceed to fetch
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: 'read' })
      logger.warn({ err: error, key }, CACHE_LOGS.READ_ERROR)
      return null
    } finally {
      readDeadline.dispose()
    }
  }

  /** Turns a stored envelope into a Result, or null to fall through to a fetch. */
  private unwrapEnvelope<T>(key: string, envelope: CacheEnvelope<T>): Result<T, E | AppError> | null {
    if (envelope.s) {
      return this.unwrapSuccess<T>(key, envelope)
    }

    if (!envelope.e) {
      return null
    }

    collectMetricsCacheHits?.inc({ prefix: this.options.prefix })
    return err(this.failures.reconstruct(envelope.e))
  }

  private unwrapSuccess<T>(key: string, envelope: CacheEnvelope<T>): Result<T, AppError> {
    const prefix = this.options.prefix

    if (!('v' in envelope)) {
      collectMetricsCacheErrors?.inc({ prefix, error_type: 'corrupted' })
      logger.error({ key, envelope }, CACHE_LOGS.CORRUPTED_ENVELOPE)
      return err(new ProviderFailureError(new Error('Corrupted Cache: Missing value')))
    }

    collectMetricsCacheHits?.inc({ prefix })
    return ok(envelope.v as T)
  }

  private async cacheAndReturn<T>(key: string, result: Result<T, E>): Promise<Result<T, E | AppError>> {
    if (isErr(result)) {
      const error = result.error

      // Negative Cache (do not cache transient/retryable failures)
      if (!this.failures.isRetryable(error)) {
        await this.setResult(key, { s: false, e: this.failures.serialize(error) }, this.failures.negativeTtlFor(error))
      }

      return err(error)
    }

    // SUCCESS: Cache as success envelope
    await this.setResult(key, { s: true, v: result.value }, this.options.defaultTtlSeconds)
    return ok(result.value)
  }

  private async setResult<T>(key: string, envelope: CacheEnvelope<T>, baseTtl: number): Promise<void> {
    if (baseTtl <= 0) {
      logger.debug({ key }, CACHE_LOGS.TTL_SKIP)
      return
    }

    // Deliberately detached from the request budget: by the time we write, the
    // answer is already computed and paid for. This is bookkeeping for the
    // *next* caller, so it gets its own small ceiling rather than being skipped
    // because the clock ran out — while still never extending the request.
    const writeDeadline = Deadline.in(CACHE_CONFIG.REDIS_OP_BUDGET_MS)

    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE)
      // `crypto.randomInt`, not `Math.random`: same uniform distribution over
      // the same inclusive range, but it does not put a predictable PRNG on a
      // path that decides when cache entries expire — an attacker who can
      // predict the jitter can line requests up with the expiry and walk the
      // whole cache into a stampede. The cost is irrelevant next to the Redis
      // round trip this jitter is computed for.
      const randomOffset = crypto.randomInt(-jitterAmount, jitterAmount + 1)
      const finalTtl = Math.max(1, baseTtl + randomOffset)

      await withinBudget(this.redis.set(key, JSON.stringify(envelope), 'EX', finalTtl), writeDeadline)
    } catch (error) {
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: 'write' })
      logger.warn({ err: error, key }, CACHE_LOGS.WRITE_ERROR)
    } finally {
      writeDeadline.dispose()
    }
  }
}
