/**
 * TelemetryReason is a self-describing, machine-readable observability tag that
 * an AppError declares once about itself — parallel to `failureMode` but with a
 * different purpose. Where `failureMode` (RETRYABLE | NOT_FOUND) drives resilient
 * routing, `telemetryReason` carries a finer-grained cause for metric labels so
 * observers can distinguish, e.g., a rate-limit from a timeout from an upstream
 * 5xx — all of which share `failureMode = RETRYABLE`.
 *
 * Consumers (e.g. provider metrics) read `error.telemetryReason` directly, with
 * no `instanceof`/type-matching: a new error subclass auto-contributes its reason.
 */
export enum TelemetryReason {
  RATE_LIMITED = 'rate_limited',
  TIMEOUT = 'timeout',
  NOT_FOUND = 'not_found',
  PROVIDER_ERROR = 'provider_error',
  UNKNOWN = 'unknown',
}
