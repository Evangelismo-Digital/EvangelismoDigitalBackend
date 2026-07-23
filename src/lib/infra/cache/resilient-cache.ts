import crypto from 'crypto'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { CACHE_LOGS } from 'messages/constants/logs/cache'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
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
    const prefix = this.options.prefix

    // 1. Circuit Breaker FIRST (before any work)
    if (this.pendingFetches.size >= this.MAX_PENDING) {
      collectMetricsCacheCircuitBreakerTrips?.inc({ prefix })
      return err(new InfraServiceOverloadError())
    }

    // 2. Dedup Check (FAST PATH - in-memory)
    const existing = this.pendingFetches.get(key)
    if (existing) {
      return await (existing as Promise<Result<T, E | AppError>>)
    }

    // 3. Fast Redis Read (Envelope Unwrapping)
    let cached: string | null = null
    try {
      cached = await this.redis.get(key)
    } catch (err) {
      // Swallow Redis connection errors and proceed to fetch
      collectMetricsCacheErrors?.inc({ prefix, error_type: 'read' })
      logger.warn({ err, key }, CACHE_LOGS.READ_ERROR)
    }

    if (cached) {
      let envelope: CacheEnvelope<T> | null = null
      try {
        envelope = JSON.parse(cached) as CacheEnvelope<T>
      } catch (err) {
        // Corrupted payload — proceed to fetch
        collectMetricsCacheErrors?.inc({ prefix, error_type: 'corrupted' })
        logger.warn({ err, key }, CACHE_LOGS.READ_ERROR)
      }

      if (envelope) {
        // If success, return the value
        if (envelope.s) {
          if (!('v' in envelope)) {
            collectMetricsCacheErrors?.inc({ prefix, error_type: 'corrupted' })
            logger.error({ key, envelope }, CACHE_LOGS.CORRUPTED_ENVELOPE)
            return err(
              new ProviderFailureError('Cache', ProviderLayer.Address, new Error('Corrupted Cache: Missing value')),
            )
          }
          collectMetricsCacheHits?.inc({ prefix })
          return ok(envelope.v as T)
        }

        // If cached failure, reconstruct error
        if (!envelope.s && envelope.e) {
          collectMetricsCacheHits?.inc({ prefix })
          const deserializer = this.options.deserializeError
          if (deserializer) {
            const deserialized = deserializer(envelope.e.type, envelope.e.message, envelope.e.data)
            if (deserialized) {
              return err(deserialized)
            }
          }

          // Fallback reconstruction
          return err(
            new ProviderFailureError(
              'Cache',
              ProviderLayer.Address,
              new Error(`Cached Error: ${envelope.e.type} - ${envelope.e.message}`),
            ),
          )
        }
      }
    }

    // 4. Double-check pattern: Check again after async Redis call
    const existingAfterRedis = this.pendingFetches.get(key)
    if (existingAfterRedis) {
      return await (existingAfterRedis as Promise<Result<T, E | AppError>>)
    }

    // 5. Create and store promise atomically
    collectMetricsCacheMisses?.inc({ prefix })
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

  private async executeFetchWithSignalLogic<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<Result<T, E>>,
    parentSignal?: AbortSignal,
  ): Promise<Result<T, E | AppError>> {
    const timeoutSignal = AbortSignal.timeout(this.FETCH_TIMEOUT)

    const signals: AbortSignal[] = [timeoutSignal]
    if (parentSignal instanceof AbortSignal) {
      signals.push(parentSignal)
    }

    const effectiveSignal = AbortSignal.any(signals)

    if (effectiveSignal.aborted) {
      return err(new TimeoutExceededError(effectiveSignal.reason || 'Timeout Exceeded'))
    }

    // Authoritative hard timeout — guarantees promise settlement
    let timeoutId: NodeJS.Timeout | undefined
    let abortListener: (() => void) | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutExceededError('Timeout Exceeded'))
      }, this.FETCH_TIMEOUT)

      // Also reject immediately if the abort signal fires before the timer
      abortListener = () => {
        reject(new TimeoutExceededError(effectiveSignal.reason || 'Timeout Exceeded'))
      }
      effectiveSignal.addEventListener('abort', abortListener, { once: true })
    })

    const endTimer = collectMetricsCacheFetchDuration?.startTimer({ prefix: this.options.prefix })

    try {
      const fetchPromise = fetcher(effectiveSignal)
      const result = await Promise.race([fetchPromise, timeoutPromise])

      // Post-fetch defensive check
      if (effectiveSignal.aborted) {
        return err(new TimeoutExceededError(effectiveSignal.reason || 'Timeout Exceeded'))
      }

      if (isErr(result)) {
        const error = result.error
        const isRetryableFn =
          this.options.isRetryable ?? ((errVal: E) => (errVal as { failureMode?: string })?.failureMode === 'RETRYABLE')

        // Negative Cache (do not cache transient/retryable failures)
        if (!isRetryableFn(error)) {
          const serializer =
            this.options.serializeError ??
            ((errVal: E) => ({
              type: (errVal as { constructor?: { name?: string } }).constructor?.name || 'Error',
              message: (errVal as { message?: string }).message || String(errVal),
              data: errVal,
            }))

          await this.setResult(key, {
            s: false,
            e: serializer(error),
          })
        }
        return err(error)
      }

      // SUCCESS: Cache as success envelope
      await this.setResult(key, { s: true, v: result.value })
      return ok(result.value)
    } catch (error) {
      if (effectiveSignal.aborted || error instanceof TimeoutExceededError) {
        const abortReason = parentSignal?.aborted ? parentSignal.reason : 'Timeout Exceeded'
        return err(new TimeoutExceededError(abortReason))
      }

      return err(new ProviderFailureError('Fetcher', ProviderLayer.Address, error))
    } finally {
      // Observe fetcher latency for both success and failure outcomes
      endTimer?.()
      // CRITICAL: Always clean up to prevent timer/listener leaks
      if (timeoutId) clearTimeout(timeoutId)
      if (abortListener) effectiveSignal.removeEventListener('abort', abortListener)
    }
  }

  private async setResult<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
    const baseTtl = !envelope.s ? this.options.negativeTtlSeconds : this.options.defaultTtlSeconds

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
