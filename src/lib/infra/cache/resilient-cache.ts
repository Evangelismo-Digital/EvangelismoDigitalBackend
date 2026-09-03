import crypto from 'crypto'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { CACHE_LOGS } from 'messages/constants/logs/cache'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import {
  collectMetricsCacheHits,
  collectMetricsCacheMisses,
  collectMetricsCacheErrors,
  collectMetricsCachePendingFetches,
  collectMetricsCacheFetchDuration,
  collectMetricsCacheCircuitBreakerTrips,
} from '@lib/metrics/cache-metrics'

export interface ResilientCacheOptions<E = unknown> {
  prefix: string
  defaultTtlSeconds: number
  negativeTtlSeconds: number
  maxPendingFetches?: number
  fetchTimeoutMs?: number
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
  e?: {
    // error: Exists only if s=false
    type: string // Error class name (e.g., 'InvalidCepError')
    message: string
    data?: unknown // Additional error data
  }
}

type SerializedError = NonNullable<CacheEnvelope<unknown>['e']>

interface TimeoutRace {
  promise: Promise<never>
  cleanup: () => void
}

export class ResilientCache<E = unknown> {
  private readonly pendingFetches = new Map<string, Promise<unknown>>()

  private readonly MAX_PENDING: number
  private readonly FETCH_TIMEOUT: number
  private readonly JITTER_PERCENTAGE: number

  constructor(
    private readonly redis: Redis,
    private readonly options: ResilientCacheOptions<E>,
  ) {
    this.MAX_PENDING = options.maxPendingFetches ?? 1_000
    this.FETCH_TIMEOUT = options.fetchTimeoutMs ?? 12_000
    this.JITTER_PERCENTAGE = options.ttlJitterPercentage ?? 0.05
  }

  generateKey(params: Record<string, unknown>): string {
    const stableString = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .sort()
      .map((k) => `${k}:${String(params[k])}`)
      .join('|')

    const hash = crypto.createHash('sha256').update(stableString).digest('hex')

    return `${this.options.prefix}${hash}`
  }

  async getOrFetch<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<Result<T, E>>,
    parentSignal?: AbortSignal,
  ): Promise<Result<T, E | AppError>> {
    // 1. Circuit Breaker FIRST (before any work)
    const overloaded = this.tripIfOverloaded()
    if (overloaded) {
      return overloaded
    }

    // 2. Dedup Check (FAST PATH - in-memory)
    const existing = this.pendingFetches.get(key)
    if (existing) {
      return await (existing as Promise<Result<T, E | AppError>>)
    }

    // 3. Fast Redis Read (Envelope Unwrapping)
    const hit = await this.readHit<T>(key)
    if (hit) {
      return hit
    }

    // 4. Double-check pattern: Check again after async Redis call
    const existingAfterRedis = this.pendingFetches.get(key)
    if (existingAfterRedis) {
      return await (existingAfterRedis as Promise<Result<T, E | AppError>>)
    }

    // 5. Create and store promise atomically
    collectMetricsCacheMisses?.inc({ prefix: this.options.prefix })
    return await this.trackPendingFetch(key, fetcher, parentSignal)
  }

  private tripIfOverloaded(): Result<never, AppError> | null {
    if (this.pendingFetches.size < this.MAX_PENDING) {
      return null
    }

    collectMetricsCacheCircuitBreakerTrips?.inc({ prefix: this.options.prefix })
    return err(new InfraServiceOverloadError())
  }

  /** Registers the in-flight fetch so concurrent callers share it, then always deregisters. */
  private async trackPendingFetch<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<Result<T, E>>,
    parentSignal?: AbortSignal,
  ): Promise<Result<T, E | AppError>> {
    const prefix = this.options.prefix
    const promise = this.executeFetchWithSignalLogic(key, fetcher, parentSignal)

    // Store immediately to catch any concurrent requests
    this.pendingFetches.set(key, promise)
    collectMetricsCachePendingFetches?.set({ prefix }, this.pendingFetches.size)

    try {
      return await promise
    } finally {
      // Clean up immediately after resolution
      this.pendingFetches.delete(key)
      collectMetricsCachePendingFetches?.set({ prefix }, this.pendingFetches.size)
    }
  }

  private async readHit<T>(key: string): Promise<Result<T, E | AppError> | null> {
    const envelope = await this.readEnvelope<T>(key)

    return envelope ? this.unwrapEnvelope<T>(key, envelope) : null
  }

  /** Reads and parses the envelope at `key`. Any failure is a miss, never a throw. */
  private async readEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
    const prefix = this.options.prefix
    let cached: string | null = null

    try {
      cached = await this.redis.get(key)
    } catch (err) {
      // Swallow Redis connection errors and proceed to fetch
      collectMetricsCacheErrors?.inc({ prefix, error_type: 'read' })
      logger.warn({ err, key }, CACHE_LOGS.READ_ERROR)
      return null
    }

    if (!cached) {
      return null
    }

    try {
      return JSON.parse(cached) as CacheEnvelope<T>
    } catch (err) {
      // Corrupted payload — proceed to fetch
      collectMetricsCacheErrors?.inc({ prefix, error_type: 'corrupted' })
      logger.warn({ err, key }, CACHE_LOGS.READ_ERROR)
      return null
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
    return err(this.reconstructError(envelope.e))
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

  private reconstructError(cached: SerializedError): E | AppError {
    const deserialized = this.options.deserializeError?.(cached.type, cached.message, cached.data)

    if (deserialized) {
      return deserialized
    }

    // Fallback reconstruction
    return new ProviderFailureError(new Error(`Cached Error: ${cached.type} - ${cached.message}`))
  }

  private async executeFetchWithSignalLogic<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<Result<T, E>>,
    parentSignal?: AbortSignal,
  ): Promise<Result<T, E | AppError>> {
    const effectiveSignal = this.buildEffectiveSignal(parentSignal)

    const preAbort = this.abortedError(effectiveSignal)
    if (preAbort) {
      return preAbort
    }

    const timeout = this.createTimeoutRace(effectiveSignal)
    const endTimer = collectMetricsCacheFetchDuration?.startTimer({ prefix: this.options.prefix })

    try {
      const result = await Promise.race([fetcher(effectiveSignal), timeout.promise])

      // Post-fetch defensive check
      const postAbort = this.abortedError(effectiveSignal)
      if (postAbort) {
        return postAbort
      }

      return await this.cacheAndReturn(key, result)
    } catch (error) {
      return this.mapFetchThrow(error, effectiveSignal, parentSignal)
    } finally {
      // Observe fetcher latency for both success and failure outcomes
      endTimer?.()
      // CRITICAL: Always clean up to prevent timer/listener leaks
      timeout.cleanup()
    }
  }

  private buildEffectiveSignal(parentSignal?: AbortSignal): AbortSignal {
    const signals: AbortSignal[] = [AbortSignal.timeout(this.FETCH_TIMEOUT)]

    if (parentSignal instanceof AbortSignal) {
      signals.push(parentSignal)
    }

    return AbortSignal.any(signals)
  }

  private abortedError(signal: AbortSignal): Result<never, AppError> | null {
    return signal.aborted ? err(new TimeoutExceededError(signal.reason || 'Timeout Exceeded')) : null
  }

  /** Authoritative hard timeout — guarantees promise settlement. */
  private createTimeoutRace(effectiveSignal: AbortSignal): TimeoutRace {
    let timeoutId: NodeJS.Timeout | undefined
    let abortListener: (() => void) | undefined

    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutExceededError('Timeout Exceeded'))
      }, this.FETCH_TIMEOUT)

      // Also reject immediately if the abort signal fires before the timer
      abortListener = () => {
        reject(new TimeoutExceededError(effectiveSignal.reason || 'Timeout Exceeded'))
      }
      effectiveSignal.addEventListener('abort', abortListener, { once: true })
    })

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (abortListener) effectiveSignal.removeEventListener('abort', abortListener)
    }

    return { promise, cleanup }
  }

  private async cacheAndReturn<T>(key: string, result: Result<T, E>): Promise<Result<T, E | AppError>> {
    if (isErr(result)) {
      const error = result.error

      // Negative Cache (do not cache transient/retryable failures)
      if (!this.isRetryable(error)) {
        await this.setResult(key, { s: false, e: this.serializeError(error) }, this.resolveNegativeTtl(error))
      }

      return err(error)
    }

    // SUCCESS: Cache as success envelope
    await this.setResult(key, { s: true, v: result.value }, this.options.defaultTtlSeconds)
    return ok(result.value)
  }

  private mapFetchThrow(
    error: unknown,
    effectiveSignal: AbortSignal,
    parentSignal?: AbortSignal,
  ): Result<never, AppError> {
    if (effectiveSignal.aborted || error instanceof TimeoutExceededError) {
      const abortReason = parentSignal?.aborted ? parentSignal.reason : 'Timeout Exceeded'
      return err(new TimeoutExceededError(abortReason))
    }

    return err(new ProviderFailureError(error))
  }

  private isRetryable(error: E): boolean {
    if (this.options.isRetryable) {
      return this.options.isRetryable(error)
    }

    return (error as { failureMode?: string })?.failureMode === 'RETRYABLE'
  }

  private serializeError(error: E): SerializedError {
    if (this.options.serializeError) {
      return this.options.serializeError(error)
    }

    return {
      type: (error as { constructor?: { name?: string } }).constructor?.name || 'Error',
      message: (error as { message?: string }).message || String(error),
      data: error,
    }
  }

  private resolveNegativeTtl(error: E): number {
    return this.options.negativeTtlFor?.(error) ?? this.options.negativeTtlSeconds
  }

  private async setResult<T>(key: string, envelope: CacheEnvelope<T>, baseTtl: number): Promise<void> {
    if (baseTtl <= 0) {
      logger.debug({ key }, CACHE_LOGS.TTL_SKIP)
      return
    }

    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE)
      const randomOffset = Math.floor(Math.random() * (jitterAmount * 2 + 1)) - jitterAmount
      const finalTtl = Math.max(1, baseTtl + randomOffset)

      await this.redis.set(key, JSON.stringify(envelope), 'EX', finalTtl)
    } catch (err) {
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: 'write' })
      logger.warn({ err, key }, CACHE_LOGS.WRITE_ERROR)
    }
  }
}
