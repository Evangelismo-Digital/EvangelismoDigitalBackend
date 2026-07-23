/**
 * FailureMode classifies AppErrors into machine-readable buckets so that
 * resilient fallback chains and cache managers can route errors without
 * resorting to `instanceof` checks.
 *
 * - RETRYABLE: infrastructure is temporarily unavailable; try the next provider.
 * - NOT_FOUND: the requested resource genuinely does not exist; cache as a
 *   negative result and surface directly to the caller.
 */
export enum FailureMode {
  RETRYABLE = 'RETRYABLE',
  NOT_FOUND = 'NOT_FOUND',
}
