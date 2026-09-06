import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

/**
 * The request budget was spent, or the caller went away, before the operation
 * could produce an answer.
 *
 * Deliberately distinct from {@link TimeoutExceededError}, which means "this
 * one attempt outran its own timeout while the parent still had budget left"
 * and is therefore RETRYABLE — a fallback chain should move on to the next
 * provider. A DeadlineExceededError says the opposite: there is no time left to
 * hear any answer, so every remaining provider would fail identically and
 * instantly. Hence FailureMode.ABORTED, which fallback chains treat as terminal
 * and cache policies refuse to store.
 *
 * Shares TimeoutExceededError's SERVICE_UNAVAILABLE type, so the HTTP response
 * the client sees is unchanged; only our own routing, logs and metrics can tell
 * the two apart.
 */
export class DeadlineExceededError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(
      INFRA_ERRORS.DEADLINE_EXCEEDED,
      reason,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.ABORTED,
      TelemetryReason.DEADLINE_EXCEEDED,
    )
    this.name = 'DeadlineExceededError'
  }
}
