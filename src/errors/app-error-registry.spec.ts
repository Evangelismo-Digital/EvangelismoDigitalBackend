import { describe, it, expect } from 'vitest'
import { serializeAppError, deserializeAppError, AppErrorRegistry } from './app-error-registry'
import { AppError } from './app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { ServiceBusyError } from './infrastructure/service-busy-error'
import { ServiceOverloadError } from './infrastructure/service-overload-error'
import { TimeoutExceededError } from './infrastructure/timeout-exceeded-error'
import { DeadlineExceededError } from './infrastructure/deadline-exceeded-error'
import { ProviderFailureError } from './infrastructure/provider-failure-error'
import { CircuitOpenError } from './infrastructure/circuit-open-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

describe('serializeAppError', () => {
  it('captures the constructor name and message', () => {
    const serialized = serializeAppError(new CoordinatesNotFoundError())
    expect(serialized.type).toBe('CoordinatesNotFoundError')
    expect(typeof serialized.message).toBe('string')
  })

  it('serializes a ServiceBusyError under its constructor name', () => {
    const serialized = serializeAppError(new ServiceBusyError('ViaCEP'))
    expect(serialized.type).toBe('ServiceBusyError')
  })

  it('prefers an explicit `data` property over the error instance itself', () => {
    const withData = Object.assign(new CoordinatesNotFoundError(), { data: { extra: 'payload' } })
    expect(serializeAppError(withData).data).toEqual({ extra: 'payload' })
  })

  it('falls back to the error instance as `data` when no `data` property exists', () => {
    const plain = new CoordinatesNotFoundError()
    expect(serializeAppError(plain).data).toBe(plain)
  })

  it('recovers the ServiceBusyError provider from structured body data', () => {
    const restored = deserializeAppError('ServiceBusyError', 'irrelevante', {
      body: { provider: 'ViaCEP' },
    })
    expect(restored).toBeInstanceOf(ServiceBusyError)
    expect((restored as ServiceBusyError).provider).toBe('ViaCEP')
  })
})

describe('deserializeAppError', () => {
  it('reconstructs InvalidCepError and recovers the 8-digit CEP from the message', () => {
    const restored = deserializeAppError('InvalidCepError', 'O CEP fornecido 12345678 não existe.')
    expect(restored).toBeInstanceOf(InvalidCepError)
    expect(restored.message).toContain('12345678')
  })

  it('recovers the CEP via the non-word-boundary fallback when 8 digits are embedded in text', () => {
    // "\b\d{8}\b" fails on "x12345678x"; the "\d{8}" fallback still matches.
    const restored = deserializeAppError('InvalidCepError', 'erro no cep x12345678x invalido')
    expect(restored).toBeInstanceOf(InvalidCepError)
    expect(restored.message).toContain('12345678')
  })

  it('picks the 8-digit run, not a stray single digit, when both appear in the message', () => {
    const restored = deserializeAppError('InvalidCepError', 'erro 5 no cep 12345678 invalido')
    expect(restored.message).toContain('12345678')
    expect(restored.message).not.toContain('fornecido 5 ')
  })

  it('reconstructs InvalidCepError with an undefined CEP when the message has no digit run', () => {
    const restored = deserializeAppError('InvalidCepError', 'CEP invalido, sem numeros')
    expect(restored).toBeInstanceOf(InvalidCepError)
    // Message is the parameterless variant (no "fornecido <cep>")
    expect(restored.message).not.toMatch(/\d/)
  })

  it('reconstructs CepToLatLonError with the numeric run from the message', () => {
    const restored = deserializeAppError('CepToLatLonError', 'Falha ao converter o CEP 87654321.')
    expect(restored).toBeInstanceOf(CepToLatLonError)
    expect(restored.message).toContain('87654321')
  })

  it('reconstructs CepToLatLonError with an empty CEP when the message has no digits', () => {
    const restored = deserializeAppError('CepToLatLonError', 'Falha ao converter o CEP.')
    expect(restored).toBeInstanceOf(CepToLatLonError)
    // trailing " ." from `${message} ${''}.`
    expect(restored.message).toMatch(/\s\.$/)
  })

  it('reconstructs parameterless errors', () => {
    expect(deserializeAppError('CoordinatesNotFoundError', 'x')).toBeInstanceOf(CoordinatesNotFoundError)
    expect(deserializeAppError('NoNearbyChurchesFoundError', 'x')).toBeInstanceOf(NoNearbyChurchesFoundError)
    expect(deserializeAppError('ServiceOverloadError', 'x')).toBeInstanceOf(ServiceOverloadError)
    expect(deserializeAppError('TimeoutExceededError', 'slow')).toBeInstanceOf(TimeoutExceededError)
    expect(deserializeAppError('DeadlineExceededError', 'sem tempo')).toBeInstanceOf(DeadlineExceededError)
  })

  it('round-trips a DeadlineExceededError without downgrading it to a retryable timeout', () => {
    const serialized = serializeAppError(new DeadlineExceededError('DEADLINE_EXPIRED'))
    const restored = deserializeAppError(serialized.type, serialized.message, serialized.data as undefined)

    expect(serialized.type).toBe('DeadlineExceededError')
    expect(restored).toBeInstanceOf(DeadlineExceededError)
    expect(restored).not.toBeInstanceOf(TimeoutExceededError)
    expect(restored.failureMode).toBe('ABORTED')
  })

  it('reconstructs EmptyChurchListError as a real instance, not undefined', () => {
    // A registry factory that returns nothing would fall through to the unknown
    // fallback and lose the error's identity, failureMode and HTTP status.
    const restored = deserializeAppError('EmptyChurchListError', 'lista vazia')

    expect(restored).toBeInstanceOf(EmptyChurchListError)
    expect(restored.body.code).not.toBe('UNKNOWN_DESERIALIZATION_ERROR')
  })

  it('round-trips every registered error type back to its own class', () => {
    // Guards the registry as a whole: a factory that stops returning its error
    // silently degrades that error to an opaque 500 on a cache read.
    const samples: AppError[] = [
      new CoordinatesNotFoundError(),
      new NoNearbyChurchesFoundError(),
      new EmptyChurchListError(),
      new ServiceOverloadError(),
      new TimeoutExceededError('slow'),
      new DeadlineExceededError('DEADLINE_EXPIRED'),
    ]

    for (const original of samples) {
      const serialized = serializeAppError(original)
      const restored = deserializeAppError(serialized.type, serialized.message, serialized.data as undefined)

      expect(restored.constructor.name).toBe(original.constructor.name)
      expect(restored.body.code).toBe(original.body.code)
    }
  })

  it('derives ServiceBusyError provider from the message when no structured data is given', () => {
    const restored = deserializeAppError('ServiceBusyError', 'Serviço temporariamente indisponível: Nominatim')
    expect((restored as ServiceBusyError).provider).toBe('Nominatim')
  })

  it('safely falls back to the message when data is present but has no body (optional chaining on data.body)', () => {
    const restored = deserializeAppError('ServiceBusyError', 'Serviço temporariamente indisponível: LocationIQ', {
      originalError: 'boom',
    })
    expect(restored).toBeInstanceOf(ServiceBusyError)
    expect((restored as ServiceBusyError).provider).toBe('LocationIQ')
  })

  it('rebuilds ProviderFailureError and preserves its RETRYABLE routing hint', () => {
    const restored = deserializeAppError('ProviderFailureError', 'falha')
    expect(restored).toBeInstanceOf(ProviderFailureError)
    expect(restored.failureMode).toBe('RETRYABLE')
  })

  it('carries the original error through as the cause when one was serialized', () => {
    const cause = new Error('socket hang up')
    const restored = deserializeAppError('ProviderFailureError', 'falha', { originalError: cause })
    expect(restored).toBeInstanceOf(ProviderFailureError)
    expect((restored as ProviderFailureError).originalError).toBe(cause)
    expect(restored.cause).toBe(cause)
  })

  it('falls back to an InfrastructureError-shaped AppError for an unknown type', () => {
    const restored = deserializeAppError('SomethingUnregistered', 'weird')
    expect(restored).toBeInstanceOf(AppError)
    expect(restored.body.code).toBe('UNKNOWN_DESERIALIZATION_ERROR')
    expect(restored.message).toBe('weird')
  })

  it('falls back when a registry factory throws', () => {
    const original = AppErrorRegistry.CoordinatesNotFoundError
    AppErrorRegistry.CoordinatesNotFoundError = () => {
      throw new Error('factory blew up')
    }
    try {
      const restored = deserializeAppError('CoordinatesNotFoundError', 'msg')
      expect(restored.body.code).toBe('UNKNOWN_DESERIALIZATION_ERROR')
    } finally {
      AppErrorRegistry.CoordinatesNotFoundError = original
    }
  })
  describe('CircuitOpenError', () => {
    it('survives a serialize/deserialize round trip', () => {
      const serialized = serializeAppError(new CircuitOpenError('Stadia Maps'))
      const restored = deserializeAppError(serialized.type, serialized.message, serialized.data)

      expect(restored).toBeInstanceOf(CircuitOpenError)
    })

    it('keeps the provider across the round trip', () => {
      // The cache stores serialized errors; losing the provider here would make
      // a restored error name the wrong upstream in logs and metrics.
      const serialized = serializeAppError(new CircuitOpenError('Stadia Maps'))
      const restored = deserializeAppError(serialized.type, serialized.message, serialized.data)

      expect((restored as CircuitOpenError).provider).toBe('Stadia Maps')
    })

    it('keeps its RETRYABLE routing after deserialization', () => {
      const restored = deserializeAppError('CircuitOpenError', 'Stadia Maps')

      expect(restored.failureMode).toBe(FailureMode.RETRYABLE)
    })
  })
})
