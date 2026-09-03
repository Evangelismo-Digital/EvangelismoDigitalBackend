/**
 * FailureMode classifies AppErrors into machine-readable buckets so that
 * resilient fallback chains and cache managers can route errors without
 * resorting to `instanceof` checks.
 *
 * - RETRYABLE: infrastructure is temporarily unavailable; try the next provider.
 * - NOT_FOUND: the requested resource genuinely does not exist; cache as a
 *   negative result and surface directly to the caller.
 * - PERMANENT: the request is deterministically unanswerable for this input,
 *   but the resource was not merely "absent" (e.g. candidates were found yet
 *   none are reachable). Like NOT_FOUND it is safe to negative-cache; unlike
 *   NOT_FOUND it carries no 404 connotation, so errors keep their own
 *   ErrorType. Fallback chains treat it as terminal, the same as NOT_FOUND.
 */
export enum FailureMode {
  RETRYABLE = 'RETRYABLE',
  NOT_FOUND = 'NOT_FOUND',
  PERMANENT = 'PERMANENT',
}
