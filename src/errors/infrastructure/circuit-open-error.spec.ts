import { describe, it, expect } from 'vitest'
import { CircuitOpenError } from './circuit-open-error'
import { ServiceBusyError } from './service-busy-error'
import { ProviderFailureError } from './provider-failure-error'
import { InfrastructureError } from '../infrastructure-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { ErrorType } from 'core/types/error-type/error-type'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

describe('CircuitOpenError', () => {
  it('is RETRYABLE, so a fallback chain moves on to the next provider', () => {
    // The load-bearing property. A tripped breaker suspends one *provider*, not
    // the request — marking it terminal would turn a healthy fallback chain into
    // an outage the moment its first provider degraded.
    expect(new CircuitOpenError('Stadia Maps').failureMode).toBe(FailureMode.RETRYABLE)
  })

  it('reports circuit_open, not a generic provider error, for metrics', () => {
    expect(new CircuitOpenError('Stadia Maps').telemetryReason).toBe(TelemetryReason.CIRCUIT_OPEN)
  })

  it('answers 503, matching how an unavailable provider already surfaces', () => {
    expect(new CircuitOpenError('Stadia Maps').type).toBe(ErrorType.SERVICE_UNAVAILABLE)
  })

  it('carries the provider it refused to call', () => {
    expect(new CircuitOpenError('Stadia Maps').provider).toBe('Stadia Maps')
  })

  it('uses the catalogued code and Portuguese message', () => {
    const error = new CircuitOpenError('Stadia Maps')

    expect(error.body.code).toBe(INFRA_ERRORS.CIRCUIT_OPEN.code)
    expect(error.body.message).toBe(INFRA_ERRORS.CIRCUIT_OPEN.message)
  })

  it('names itself, so logs and the registry agree on the type', () => {
    expect(new CircuitOpenError('Stadia Maps').name).toBe('CircuitOpenError')
  })

  it('is an InfrastructureError, so the handler sanitizes it before the client', () => {
    expect(new CircuitOpenError('Stadia Maps')).toBeInstanceOf(InfrastructureError)
  })

  it('preserves the underlying cause when one is given', () => {
    const cause = new Error('Breaker is open')

    expect(new CircuitOpenError('Stadia Maps', cause).originalError).toBe(cause)
  })

  describe('is distinguishable from its neighbours', () => {
    // All three are RETRYABLE and all three mean "this provider gave us nothing".
    // Only telemetryReason tells an operator whether upstream is erroring, is
    // pushing back, or is not being called at all — which decides whose service
    // to go and look at.
    it('differs from ServiceBusyError, which means the provider answered 429', () => {
      const circuit = new CircuitOpenError('Stadia Maps')
      const busy = new ServiceBusyError('Stadia Maps')

      expect(circuit.failureMode).toBe(busy.failureMode)
      expect(circuit.telemetryReason).not.toBe(busy.telemetryReason)
    })

    it('differs from ProviderFailureError, which means the call was made and failed', () => {
      const circuit = new CircuitOpenError('Stadia Maps')
      const failure = new ProviderFailureError(new Error('boom'))

      expect(circuit.telemetryReason).not.toBe(failure.telemetryReason)
    })
  })
})
