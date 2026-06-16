import crypto from 'crypto'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'

export interface ResilientCacheOptions<E = any> {
  prefix: string
  defaultTtlSeconds: number
  negativeTtlSeconds: number
  maxPendingFetches?: number
  fetchTimeoutMs?: number
  ttlJitterPercentage?: number
  serializeError?: (error: E) => { type: string; message: string; data?: any }
  deserializeError?: (type: string, message: string, data?: any) => E
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
    data?: any // Additional error data
  }
}

export class ResilientCache<E = any> {
  private readonly pendingFetches = new Map<string, Promise<any>>()

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
    if (this.pendingFetches.size >= this.MAX_PENDING) {
      return errOf(new InfraServiceOverloadError())
    }

    // 2. Dedup Check (FAST PATH - in-memory)
    const existing = this.pendingFetches.get(key)
    if (existing) {
      return await (existing as Promise<Result<T, E | AppError>>)
    }

    // 3. Fast Redis Read (Envelope Unwrapping)
    try {
      const cached = await this.redis.get(key)
      if (cached) {
        const envelope = JSON.parse(cached) as CacheEnvelope<T>

        // If success, return the value
        if (envelope.s) {
          if (!('v' in envelope)) {
            logger.error({ key, envelope }, 'Cache corrompida detectada: CacheEnvelope de sucesso sem valor')
            return errOf(
              new ProviderFailureError('Cache', ProviderLayer.Address, new Error('Corrupted Cache: Missing value')),
            )
          }
          return ok(envelope.v as T)
        }

        // If cached failure, reconstruct error
        if (!envelope.s && envelope.e) {
          const deserializer = this.options.deserializeError
          if (deserializer) {
            const deserialized = deserializer(envelope.e.type, envelope.e.message, envelope.e.data)
            if (deserialized) {
              return errOf(deserialized)
            }
          }

          // Fallback reconstruction
          return errOf(
            new ProviderFailureError(
              'Cache',
              ProviderLayer.Address,
              new Error(`Cached Error: ${envelope.e.type} - ${envelope.e.message}`),
            ),
          )
        }
      }
    } catch (err) {
      // Swallow Redis connection/parsing errors and proceed to fetch
      logger.warn({ err, key }, 'Erro de leitura ou falha do Redis. Continuando sem cache.')
    }

    // 4. Double-check pattern: Check again after async Redis call
    const existingAfterRedis = this.pendingFetches.get(key)
    if (existingAfterRedis) {
      return await (existingAfterRedis as Promise<Result<T, E | AppError>>)
    }

    // 5. Create and store promise atomically
    const promise = this.executeFetchWithSignalLogic(key, fetcher, parentSignal)

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
      return errOf(new TimeoutExceededError(effectiveSignal.reason))
    }

    try {
      const result = await fetcher(effectiveSignal)

      if (effectiveSignal.aborted) {
        return errOf(new TimeoutExceededError(effectiveSignal.reason))
      }

      if (isErr(result)) {
        const err = result.error
        const isRetryableFn = this.options.isRetryable ?? ((error: E) => (error as any)?.failureMode === 'RETRYABLE')

        // Negative Cache (do not cache transient/retryable failures)
        if (!isRetryableFn(err)) {
          const serializer =
            this.options.serializeError ??
            ((error: E) => ({
              type: (error as any).constructor?.name || 'Error',
              message: (error as any).message || String(error),
              data: error,
            }))

          await this.setResult(key, {
            s: false,
            e: serializer(err),
          })
        }
        return errOf(err)
      }

      // SUCCESS: Cache as success envelope
      await this.setResult(key, { s: true, v: result.value })
      return ok(result.value)
    } catch (error) {
      // The fetcher threw an UNHANDLED exception.
      if (effectiveSignal.aborted) {
        const abortReason = parentSignal?.aborted ? parentSignal.reason : 'Timeout Exceeded'
        return errOf(new TimeoutExceededError(abortReason))
      }

      // We do not cache unhandled system exceptions.
      return errOf(new ProviderFailureError('Fetcher', ProviderLayer.Address, error))
    }
  }

  private async setResult<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
    const baseTtl = !envelope.s ? this.options.negativeTtlSeconds : this.options.defaultTtlSeconds

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
      logger.warn({ err, key }, 'Falha ao escrever no Redis (não fatal, continuando)')
    }
  }
}
