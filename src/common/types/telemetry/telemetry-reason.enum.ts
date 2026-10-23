/**
 * TelemetryReason is a self-describing, machine-readable observability tag that
 * an AppError declares once about itself — parallel to `failureMode` but with a
 * different purpose. Where `failureMode` (RETRYABLE | NOT_FOUND) drives resilient
 * routing, `telemetryReason` carries a finer-grained cause for metric labels so
 * observers can distinguish, e.g., a rate-limit from a timeout from an upstream
 * 5xx — all of which share `failureMode = RETRYABLE`. TIMEOUT and
 * DEADLINE_EXCEEDED are likewise distinguished here: one attempt outran its
 * own timeout, versus the whole request budget being spent. CIRCUIT_OPEN is
 * likewise distinct from PROVIDER_ERROR: the provider was never called at all,
 * because a breaker had already tripped on its recent failure rate.
 *
 * Consumers (e.g. provider metrics) read `error.telemetryReason` directly, with
 * no `instanceof`/type-matching: a new error subclass auto-contributes its reason.
 */
export enum TelemetryReason {
  RATE_LIMITED = 'rate_limited',
  TIMEOUT = 'timeout',
  DEADLINE_EXCEEDED = 'deadline_exceeded',
  NOT_FOUND = 'not_found',
  CIRCUIT_OPEN = 'circuit_open',
  PROVIDER_ERROR = 'provider_error',
  UNKNOWN = 'unknown',
}
