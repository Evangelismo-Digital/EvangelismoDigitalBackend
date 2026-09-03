import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { AppError } from 'errors/app-error'
import { serializeAppError, deserializeAppError } from 'errors/app-error-registry'
import { ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'

/**
 * Negative-caching policy for the single "find the nearest church" cache layer.
 *
 * Only deterministic "this input has no answer" outcomes are worth storing as a
 * negative entry: NOT_FOUND (the resource is genuinely absent) and PERMANENT
 * (candidates existed but none qualify). Everything else — crucially every
 * SystemError and InfrastructureError, which carry no failureMode at all —
 * stays retryable, so a transient 500 is never pinned to a CEP for the whole
 * negative TTL.
 *
 * Lives outside the factory so it can be exercised without dragging env,
 * Prisma and the provider graph into a unit test.
 */
export function isRetryableChurchLookupError(error: AppError): boolean {
  return error.failureMode !== FailureMode.NOT_FOUND && error.failureMode !== FailureMode.PERMANENT
}

/**
 * How long a cacheable failure is kept.
 *
 * This is the CEP negative cache: a CEP that could not be resolved to
 * coordinates (NOT_FOUND) is held far longer than a lookup that merely found
 * no nearby church (PERMANENT), because the former is what protects the
 * external address and geocoding APIs from being re-asked a question whose
 * answer cannot change. The latter depends only on our own database, so it
 * expires quickly to let newly registered churches surface.
 *
 * Only consulted for errors {@link isRetryableChurchLookupError} deems
 * cacheable — that is, NOT_FOUND or PERMANENT — so the short TTL doubles as
 * the defensive default rather than needing a third, unreachable branch.
 */
export function negativeTtlForChurchLookup(error: AppError): number {
  return error.failureMode === FailureMode.NOT_FOUND
    ? CACHE_CONFIG.NEAREST_CHURCHES.NOT_FOUND_TTL_SECONDS
    : CACHE_CONFIG.NEAREST_CHURCHES.PERMANENT_TTL_SECONDS
}

/**
 * Options for the single cache layer of the "find the nearest church" flow.
 * Built here rather than in the factory so the policy and its wiring can be
 * asserted together in a unit test.
 */
export function makeNearestChurchesCacheOptions(): ResilientCacheOptions<AppError> {
  return {
    prefix: CACHE_CONFIG.NEAREST_CHURCHES.PREFIX,
    defaultTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.DEFAULT_TTL_SECONDS,
    negativeTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.NEGATIVE_TTL_SECONDS,
    maxPendingFetches: CACHE_CONFIG.NEAREST_CHURCHES.MAX_PENDING_FETCHES,
    fetchTimeoutMs: CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS,
    serializeError: serializeAppError,
    deserializeError: deserializeAppError,
    isRetryable: isRetryableChurchLookupError,
    negativeTtlFor: negativeTtlForChurchLookup,
  }
}
