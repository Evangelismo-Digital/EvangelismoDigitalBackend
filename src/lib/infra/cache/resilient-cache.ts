import crypto from 'crypto'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { ServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { OperationAbortedError } from '@lib/errors/infra/cache/operation-aborted-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'

export interface ResilientCacheOptions {
  prefix: string
  defaultTtlSeconds: number
  negativeTtlSeconds: number
  maxPendingFetches?: number
  fetchTimeoutMs?: number
  ttlJitterPercentage?: number
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

// === Error thrown when retrieving a cached failure ===
export class CachedFailureError extends Error {
  public readonly errorType: string
  public readonly errorData?: unknown

  constructor(type: string, message: string, data?: unknown) {
    super(message)
    this.name = 'CachedFailureError'
    this.errorType = type
    this.errorData = data
  }
}

export class ResilientCache {
  private readonly pendingFetches = new Map<string, Promise<unknown>>()

  private readonly MAX_PENDING: number
  private readonly FETCH_TIMEOUT: number
  private readonly JITTER_PERCENTAGE: number

  constructor(
    private readonly redis: Redis,
    private readonly options: ResilientCacheOptions,
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
    fetcher: (signal: AbortSignal) => Promise<T>,
    // Optional: Function that decides if error should be cached and returns error metadata
    errorMapper?: (error: unknown) => { type: string; message: string; data?: unknown } | null,
    parentSignal?: AbortSignal,
  ): Promise<T | null> {
    // 1. Circuit Breaker FIRST (before any work)
    if (this.pendingFetches.size >= this.MAX_PENDING) {
      throw new ServiceOverloadError()
    }

    // 2. Dedup Check (FAST PATH - in-memory)
    const existing = this.pendingFetches.get(key)
    if (existing) {
      return await (existing as Promise<T>)
    }

    // 3. Fast Redis Read (Envelope Unwrapping)
    try {
      const cached = await this.redis.get(key)
      if (cached) {
        const envelope = JSON.parse(cached) as CacheEnvelope<T>

        // If success, return the value
        if (envelope.s) {
          // Validate that value exists in success envelope
          if (!('v' in envelope)) {
            logger.error({ key, envelope }, 'Cache corrompida detectada: CacheEnvelop de sucesso sem valor')
            throw new OperationAbortedError('Cache corrompida: CacheEnvelop de sucesso sem valor')
          }
          return envelope.v as T
        }

        // If cached failure, throw CachedFailureError
        if (!envelope.s && envelope.e) {
          throw new CachedFailureError(envelope.e.type, envelope.e.message, envelope.e.data)
        }
      }
    } catch (err) {
      // Re-throw specific error types that should propagate
      if (err instanceof CachedFailureError) throw err
      if (err instanceof Error && err.message.includes('Cache corrompida')) throw err

      // Only swallow Redis connection/parsing errors
      logger.warn({ err, key }, 'Erro de leitura ou falha do Redis. Continuando sem cache.')
    }

    // 4. Double-check pattern: Check again after async Redis call
    // This handles race conditions where multiple callers passed the first check
    const existingAfterRedis = this.pendingFetches.get(key)
    if (existingAfterRedis) {
      return await (existingAfterRedis as Promise<T>)
    }

    // 5. Create and store promise atomically
    const promise = this.executeFetchWithSignalLogic(key, fetcher, errorMapper, parentSignal)

    // Store immediately to catch any concurrent requests
    this.pendingFetches.set(key, promise)

    try {
      return await promise
    } finally {
      // Clean up immediately after resolution
      this.pendingFetches.delete(key)
    }
  }

  private async executeFetchWithSignalLogic<T>(
    key: string,
    fetcher: (signal: AbortSignal) => Promise<T>,
    errorMapper?: (error: unknown) => { type: string; message: string; data?: unknown } | null,
    parentSignal?: AbortSignal,
  ): Promise<T | null> {
    const timeoutSignal = AbortSignal.timeout(this.FETCH_TIMEOUT)

    const signals: AbortSignal[] = [timeoutSignal]
    if (parentSignal) {
      signals.push(parentSignal)
    }

    const effectiveSignal = AbortSignal.any(signals)

    if (effectiveSignal.aborted) {
      throw this.normalizeAbortReason(effectiveSignal.reason)
    }

    try {
      const result = await fetcher(effectiveSignal)

      if (effectiveSignal.aborted) {
        throw this.normalizeAbortReason(effectiveSignal.reason)
      }

      // SUCCESS: Cache as success envelope
      await this.setResult(key, { s: true, v: result })
      return result
    } catch (error) {
      // Check first if it was aborted (Timeout/User Cancellation)
      if (effectiveSignal.aborted) {
        if (parentSignal?.aborted) {
          throw this.normalizeAbortReason(parentSignal.reason)
        }
        throw new TimeoutExceededOnFetchError()
      }

      // === ERROR CAPTURE LOGIC ===
      // Check if error is cacheable (e.g., InvalidCepError)
      if (errorMapper) {
        const errorMetadata = errorMapper(error)

        if (errorMetadata) {
          await this.setResult(key, {
            s: false,
            e: errorMetadata,
          })

          // Throw CachedFailureError for consistency (all callers get same error type)
          throw new CachedFailureError(errorMetadata.type, errorMetadata.message, errorMetadata.data)
        }
      }

      // If not mapped, it's a system error (don't cache, just throw)
      throw error
    }
  }

  private normalizeAbortReason(reason: unknown): Error {
    if (reason instanceof Error) {
      if (reason instanceof TimeoutExceededOnFetchError || reason instanceof OperationAbortedError) {
        return reason
      }

      throw new TimeoutExceededOnFetchError(reason)
    }
    if (typeof reason === 'string') {
      return new TimeoutExceededOnFetchError(reason)
    }
    return new OperationAbortedError(reason)
  }

  private async setResult<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
    // If s=false (Failure), use negative TTL (short). If s=true, use default TTL.
    const baseTtl = !envelope.s ? this.options.negativeTtlSeconds : this.options.defaultTtlSeconds

    // Handle edge case: if negativeTtlSeconds is 0, don't cache at all
    if (baseTtl <= 0) {
      logger.debug({ key }, 'TTL <= 0, pulando escrita no cache')
      return
    }

    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE)
      const randomOffset = Math.floor(Math.random() * (jitterAmount * 2 + 1)) - jitterAmount
      const finalTtl = Math.max(1, baseTtl + randomOffset)

      await this.redis.set(key, JSON.stringify(envelope), 'EX', finalTtl)
    } catch (err) {
      // Cache write is best-effort - log but don't throw
      // Redis failure should not break successful fetches
      logger.warn({ err, key }, 'Falha ao escrever no Redis (não fatal, continuando)')
      // Don't re-throw - system continues functioning without cache
    }
  }
}
