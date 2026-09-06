/**
 * Defect: a provider-carrying InfrastructureError lost its provider name when
 * round-tripped through serializeAppError -> deserializeAppError, and came back
 * carrying its own user-facing message where the provider name belonged.
 *
 * Why it mattered: `provider` is a metric label and a log field. A restored
 * ServiceBusyError reported "Serviço temporariamente indisponível devido ao
 * limite de requisições." as its provider, which both destroys the metric's
 * cardinality (one label per message, not per upstream) and points an operator
 * at nothing. CircuitOpenError, added alongside the cockatiel policies, would
 * have shipped with the same defect.
 *
 * Cause: `serializeAppError` stores the error instance itself as `data`, so its
 * own fields land at the *top level* of the payload. The registry factories only
 * read `data.body.provider` — a shape produced by hand-built payloads but never
 * by the serializer — so the lookup missed and fell through to the message.
 *
 * Defect id: R1-1 (found by the CircuitOpenError round-trip test).
 */
import { describe, it, expect } from 'vitest'
import { serializeAppError, deserializeAppError } from './app-error-registry'
import { CircuitOpenError } from './infrastructure/circuit-open-error'
import { ServiceBusyError } from './infrastructure/service-busy-error'

function roundTrip(error: CircuitOpenError | ServiceBusyError) {
  const serialized = serializeAppError(error)
  return deserializeAppError(serialized.type, serialized.message, serialized.data)
}

describe('provider lost in error round trip', () => {
  it('keeps the provider on a round-tripped CircuitOpenError', () => {
    expect((roundTrip(new CircuitOpenError('Stadia Maps')) as CircuitOpenError).provider).toBe('Stadia Maps')
  })

  it('keeps the provider on a round-tripped ServiceBusyError', () => {
    expect((roundTrip(new ServiceBusyError('LocationIQ')) as ServiceBusyError).provider).toBe('LocationIQ')
  })

  it('never lets the user-facing message become the provider label', () => {
    // The symptom itself, stated directly: whatever we recover, it must not be
    // the sentence we show to end users.
    const restored = roundTrip(new ServiceBusyError('Nominatim')) as ServiceBusyError

    expect(restored.provider).not.toBe(restored.message)
    expect(restored.provider).not.toContain('Serviço temporariamente')
  })

  describe('counterweight — the fix did not overshoot', () => {
    it('still honours an explicitly structured body.provider payload', () => {
      // Hand-built payloads use `body.provider`; reading the top level first
      // must not stop that shape from working.
      const restored = deserializeAppError('ServiceBusyError', 'irrelevante', {
        body: { provider: 'ViaCEP' },
      })

      expect((restored as ServiceBusyError).provider).toBe('ViaCEP')
    })

    it('still derives the provider from the message when no data is given at all', () => {
      // The cache stores only { type, message }, so this path is the common one
      // in production and must keep working.
      const restored = deserializeAppError('ServiceBusyError', 'Serviço temporariamente indisponível: Nominatim')

      expect((restored as ServiceBusyError).provider).toBe('Nominatim')
    })

    it('labels a data-less CircuitOpenError neutrally rather than with its message', () => {
      const restored = deserializeAppError('CircuitOpenError', 'Provedor externo temporariamente suspenso.')

      expect((restored as CircuitOpenError).provider).toBe('Unknown Provider')
    })
  })
})
