import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `vi.mock` factories are hoisted above every other statement, so the object
// they close over has to be hoisted with them.
const { envMock } = vi.hoisted(() => ({
  envMock: {
    CIRCUIT_BREAKER_ENABLED: true,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 0.5,
    // A short window with a throughput floor of 1 means two failed calls are
    // enough to open the circuit, instead of the ~150 the production settings
    // deliberately require.
    CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: 1_000,
    CIRCUIT_BREAKER_MIN_THROUGHPUT: 1,
    CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: 10_000,
  },
}))

vi.mock('@env/index', () => ({ env: envMock }))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getProviderCircuitBreaker, resetProviderCircuitBreakers } from './provider-circuit-breaker'
import { runWithRetries } from './deadline-retry'
import { Deadline } from 'core/shared/deadline'
import { isErr, isOk } from 'core/shared/result'
import { AxiosError } from 'axios'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'

/** A 429 maps to ServiceBusyError, which is RETRYABLE — the breaker counts it. */
function retryableError(): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Request failed with status code 429',
    isAxiosError: true,
    response: { status: 429, data: {}, statusText: '', headers: {}, config: { url: '/viacep/123' } as never },
    config: { url: '/viacep/123' } as never,
    toJSON: () => ({}),
  } as AxiosError
}

/** A 404 from an address provider maps to InvalidCepError, which is NOT_FOUND. */
function notFoundError(): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Request failed with status code 404',
    isAxiosError: true,
    response: { status: 404, data: {}, statusText: '', headers: {}, config: { url: '/viacep/01310100' } as never },
    config: { url: '/viacep/01310100' } as never,
    toJSON: () => ({}),
  } as AxiosError
}

function call(providerName: string, action: ReturnType<typeof vi.fn>, maxAttempts = 1) {
  return runWithRetries<unknown>({
    deadline: Deadline.in(30_000),
    providerName,
    maxAttempts,
    backoffMs: 0,
    attemptTimeoutMs: 2_000,
    action: action as unknown as (deadline: Deadline) => Promise<unknown>,
  })
}

describe('provider circuit breaker registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    envMock.CIRCUIT_BREAKER_ENABLED = true
  })

  afterEach(() => {
    resetProviderCircuitBreakers()
  })

  it('returns the same instance for the same provider', () => {
    // The load-bearing property: a breaker rebuilt per call sees one request,
    // never accumulates a failure rate, and can never open.
    expect(getProviderCircuitBreaker('ViaCEP')).toBe(getProviderCircuitBreaker('ViaCEP'))
  })

  it('keeps providers isolated from one another', () => {
    // One failing upstream must not suspend a healthy one.
    expect(getProviderCircuitBreaker('ViaCEP')).not.toBe(getProviderCircuitBreaker('BrasilAPI'))
  })

  it('returns nothing at all when breaking is disabled', () => {
    envMock.CIRCUIT_BREAKER_ENABLED = false

    expect(getProviderCircuitBreaker('ViaCEP')).toBeUndefined()
  })

  it('forgets its instances on reset', () => {
    const before = getProviderCircuitBreaker('ViaCEP')
    resetProviderCircuitBreakers()

    expect(getProviderCircuitBreaker('ViaCEP')).not.toBe(before)
  })
})

describe('circuit breaking through runWithRetries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    envMock.CIRCUIT_BREAKER_ENABLED = true
  })

  afterEach(() => {
    resetProviderCircuitBreakers()
  })

  it('stops calling a provider that keeps failing', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())

    await call('Stadia Maps', action)
    await call('Stadia Maps', action)
    const callsBeforeOpen = action.mock.calls.length

    const result = await call('Stadia Maps', action)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(CircuitOpenError)
    // The point of the breaker: no further request reached the provider.
    expect(action).toHaveBeenCalledTimes(callsBeforeOpen)
  })

  it('names the provider it refused to call', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())

    await call('Stadia Maps', action)
    await call('Stadia Maps', action)
    const result = await call('Stadia Maps', action)

    if (isErr(result)) {
      expect((result.error as CircuitOpenError).provider).toBe('Stadia Maps')
      expect(result.error.telemetryReason).toBe(TelemetryReason.CIRCUIT_OPEN)
    }
  })

  it('keeps a tripped circuit RETRYABLE so a fallback chain moves on', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())

    await call('Stadia Maps', action)
    await call('Stadia Maps', action)
    const result = await call('Stadia Maps', action)

    if (isErr(result)) expect(result.error.failureMode).toBe(FailureMode.RETRYABLE)
  })

  it('leaves a second provider reachable while the first is open', async () => {
    const failing = vi.fn().mockRejectedValue(retryableError())
    await call('Stadia Maps', failing)
    await call('Stadia Maps', failing)

    const healthy = vi.fn().mockResolvedValue('ok')
    const result = await call('ViaCEP', healthy)

    expect(isOk(result)).toBe(true)
    expect(healthy).toHaveBeenCalledTimes(1)
  })

  it('does not trip on NOT_FOUND, which is a real answer rather than a fault', async () => {
    // A CEP that does not exist says nothing about the provider's health.
    // Counting it would suspend a perfectly working upstream.
    const action = vi.fn().mockRejectedValue(notFoundError())

    await call('ViaCEP', action)
    await call('ViaCEP', action)
    const result = await call('ViaCEP', action)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(InvalidCepError)
    expect(action).toHaveBeenCalledTimes(3)
  })

  it('never opens a circuit when breaking is disabled', async () => {
    envMock.CIRCUIT_BREAKER_ENABLED = false
    const action = vi.fn().mockRejectedValue(retryableError())

    await call('Stadia Maps', action)
    await call('Stadia Maps', action)
    const result = await call('Stadia Maps', action)

    // Still reaching the provider, still reporting its own error.
    expect(action).toHaveBeenCalledTimes(3)
    if (isErr(result)) expect(result.error).not.toBeInstanceOf(CircuitOpenError)
  })
})
