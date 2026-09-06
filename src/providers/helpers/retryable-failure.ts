import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

/**
 * Whether a failure is worth another call.
 *
 * Shared by the retry policy and the circuit breaker so the two can never drift
 * apart: a breaker that counted failures the retry loop ignores — a NOT_FOUND,
 * say, or a request the caller cancelled — would trip on healthy providers and
 * suspend them for everyone.
 *
 * It lives in its own module rather than in either policy because both import
 * it, and putting it in one of them would create a cycle across the pair.
 */
export function isRetryableFailure(error: unknown): boolean {
  return error instanceof AppError && error.failureMode === FailureMode.RETRYABLE
}
