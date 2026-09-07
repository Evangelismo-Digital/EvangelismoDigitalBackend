import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'

/**
 * How a failure is stored in the cache and rebuilt from it.
 *
 * `ResilientCache` was carrying four private methods that together answer one
 * question — *what does this failure mean, and is it worth remembering?* —
 * mixed in among Redis I/O, single-flight bookkeeping, policy composition and
 * metrics. They are the part with the sharpest consequences (a wrong answer
 * pins an unrelated outage to a perfectly good key for the whole negative TTL)
 * and the part a reader most often needs to check in isolation, so they get
 * their own name.
 *
 * Behaviour is unchanged; this is the same code with a home.
 */

/** The error half of a cache envelope, as written to Redis. */
export interface SerializedError {
  type: string
  message: string
  data?: unknown
}

/** The subset of the cache's options that concerns failures. */
export interface CacheFailurePolicyOptions<E> {
  negativeTtlSeconds: number
  serializeError?: (error: E) => SerializedError
  deserializeError?: (type: string, message: string, data?: unknown) => E
  isRetryable?: (error: E) => boolean
  negativeTtlFor?: (error: E) => number
}

export class CacheFailurePolicy<E> {
  constructor(private readonly options: CacheFailurePolicyOptions<E>) {}

  /**
   * Whether a failure is too transient to be worth remembering.
   *
   * The default answers "anything that is not a deterministic statement about
   * this key". Only NOT_FOUND ("the resource does not exist") and PERMANENT
   * ("candidates existed, none qualify") will still be true in an hour. A
   * RETRYABLE blip, an ABORTED clock event, and — crucially — an untagged
   * SystemError or InfrastructureError all say something about *us* rather
   * than about the input, so caching them would pin an unrelated failure to a
   * perfectly good key for the whole negative TTL.
   *
   * Callers may still override via `options.isRetryable`;
   * `isRetryableChurchLookupError` states this same rule explicitly for the
   * nearest-church cache.
   */
  isRetryable(error: E): boolean {
    if (this.options.isRetryable) {
      return this.options.isRetryable(error)
    }

    const failureMode = (error as { failureMode?: string }).failureMode

    return failureMode !== FailureMode.NOT_FOUND && failureMode !== FailureMode.PERMANENT
  }

  serialize(error: E): SerializedError {
    if (this.options.serializeError) {
      return this.options.serializeError(error)
    }

    return {
      type: (error as { constructor?: { name?: string } }).constructor?.name || 'Error',
      message: (error as { message?: string }).message || String(error),
      data: error,
    }
  }

  reconstruct(cached: SerializedError): E | AppError {
    const deserialized = this.options.deserializeError?.(cached.type, cached.message, cached.data)

    if (deserialized) {
      return deserialized
    }

    // Fallback reconstruction
    return new ProviderFailureError(new Error(`Cached Error: ${cached.type} - ${cached.message}`))
  }

  negativeTtlFor(error: E): number {
    return this.options.negativeTtlFor?.(error) ?? this.options.negativeTtlSeconds
  }
}
