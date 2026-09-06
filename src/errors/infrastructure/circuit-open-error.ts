import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

/**
 * A circuit breaker refused the call: this provider has been failing often
 * enough recently that we stopped asking, so no request was made at all.
 *
 * RETRYABLE, and deliberately so — the *provider* is suspended, not the
 * request. A fallback chain should move straight on to the next provider, which
 * is the whole point of tripping a breaker: the alternative is spending the
 * caller's budget waiting on an upstream we already know is unhealthy.
 *
 * Distinct from {@link ServiceBusyError} (the provider answered 429 — it was
 * called, and it pushed back) and from {@link ProviderFailureError} (it was
 * called and failed). Only `telemetryReason` separates them in metrics, so an
 * operator can tell "upstream is erroring" from "we stopped calling upstream" —
 * a distinction that decides whether to look at their service or at ours.
 */
export class CircuitOpenError extends InfrastructureError {
  public readonly provider: string

  constructor(provider: string, reason?: unknown) {
    super(
      INFRA_ERRORS.CIRCUIT_OPEN,
      reason,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.RETRYABLE,
      TelemetryReason.CIRCUIT_OPEN,
    )
    this.name = 'CircuitOpenError'
    this.provider = provider
  }
}
