import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import { Prisma } from '@prisma/client'
import { FindNearestChurchesErrorMapper } from './find-nearest-churches-error-mapper'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { deserializeAppError } from 'errors/app-error-registry'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'
import { ServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { BrokenCircuitError, BulkheadRejectedError } from 'cockatiel'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

function createFakeAxiosError(
  status?: number,
  code?: string,
  url = 'http://api.awesomeapi.com.br/12345678',
): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Axios error occurred',
    isAxiosError: true,
    code,
    response:
      status !== undefined
        ? {
            status,
            data: {},
            statusText: 'Error',
            headers: {},
            config: { url } as any,
          }
        : undefined,
    config: { url } as any,
    toJSON: () => ({}),
  } as AxiosError
}

describe('FindNearestChurchesErrorMapper', () => {
  it('maps 404 to InvalidCepError for address providers', () => {
    const err = createFakeAxiosError(404, undefined, 'https://viacep.com.br/ws/12345678/json')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(InvalidCepError)
    expect(mapped.message).toContain('12345678')
  })

  it('should format InvalidCepError message with CEP when provided', () => {
    const err = new InvalidCepError('99392978')
    expect(err.message).toBe('O CEP fornecido 99392978 não existe.')
  })

  it('maps 404 to CoordinatesNotFoundError for geocoding providers', () => {
    const err = createFakeAxiosError(404, undefined, 'https://nominatim.openstreetmap.org/search')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(CoordinatesNotFoundError)
  })

  it('maps 429 to ServiceBusyError', () => {
    const err = createFakeAxiosError(429, undefined, 'https://viacep.com.br/ws/12345678/json')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(ServiceBusyError)
    expect(mapped.body.code).toBe('SERVICE_BUSY')
    // Provider name is preserved as a class property, not in the user-facing message
    expect((mapped as ServiceBusyError).provider).toBe('ViaCEP')
  })

  it('maps ERR_CANCELED to TimeoutExceededError', () => {
    const err = createFakeAxiosError(undefined, 'ERR_CANCELED')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(TimeoutExceededError)
  })

  it('maps ECONNABORTED / timeout to TimeoutExceededError', () => {
    const err = createFakeAxiosError(undefined, 'ECONNABORTED')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(TimeoutExceededError)
  })

  it('maps a timeout named only in the message, whatever its casing', () => {
    const err = createFakeAxiosError(undefined, undefined)
    err.message = 'Request Timeout Of 5000ms Exceeded'
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(TimeoutExceededError)
  })

  it('does not treat an error with no code and no timeout wording as a timeout', () => {
    const err = createFakeAxiosError(500, undefined)
    err.message = 'Internal Server Error'
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(ProviderFailureError)
  })

  it('maps generic Axios error to ProviderFailureError', () => {
    const err = createFakeAxiosError(500, undefined, 'https://api.awesomeapi.com.br/12345678')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(ProviderFailureError)
  })

  it.each([
    ['https://viacep.com.br/ws/12345678/json', 'ViaCEP'],
    ['http://api.awesomeapi.com.br/12345678', 'AwesomeAPI'],
    ['https://brasilapi.com.br/api/cep/v1/12345678', 'BrasilAPI'],
    ['https://nominatim.openstreetmap.org/search', 'Nominatim'],
    ['https://us1.locationiq.com/v1/search', 'LocationIQ'],
    ['https://api.stadiamaps.com/route/v1', 'Stadia Maps'],
  ])('names the provider behind a 429 from %s as %s', (url, provider) => {
    const err = createFakeAxiosError(429, undefined, url)
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect((mapped as ServiceBusyError).provider).toBe(provider)
  })

  it('falls back to a placeholder name for an unrecognised provider URL', () => {
    const err = createFakeAxiosError(429, undefined, 'https://example.com/whatever')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect((mapped as ServiceBusyError).provider).toBe('Unknown Provider')
  })

  it('survives an Axios error carrying no config at all', () => {
    const err = createFakeAxiosError(429, undefined)
    // Axios does not always populate `config` (e.g. a failure before the request is built)
    Object.assign(err, { config: undefined })

    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect((mapped as ServiceBusyError).provider).toBe('Unknown Provider')
  })

  it('treats a 404 with no config as a geocoding miss rather than an invalid CEP', () => {
    const err = createFakeAxiosError(404, undefined)
    Object.assign(err, { config: undefined })

    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(CoordinatesNotFoundError)
  })

  it('maps PrismaClientKnownRequestError to DatabaseQueryError', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Database query failed', {
      code: 'P2002',
      clientVersion: '7.2.0',
    })
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(DatabaseQueryError)
  })

  it('maps PrismaClientUnknownRequestError to DatabaseQueryError', () => {
    const err = new Prisma.PrismaClientUnknownRequestError('Database connection error', {
      clientVersion: '7.2.0',
    })
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(DatabaseQueryError)
  })

  it('returns AppError directly', () => {
    const err = new InvalidCepError()
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBe(err)
  })

  it('runs block catching error and returns mapped AppError', async () => {
    const res = await FindNearestChurchesErrorMapper.runCatching(async () => {
      throw createFakeAxiosError(404, undefined, 'https://viacep.com.br/ws/12345678/json')
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toBeInstanceOf(InvalidCepError)
    }
  })

  it('deserializes InvalidCepError and extracts CEP from message', () => {
    const deserialized = deserializeAppError('InvalidCepError', 'O CEP fornecido 99392978 não existe.')
    expect(deserialized).toBeInstanceOf(InvalidCepError)
    expect(deserialized?.message).toBe('O CEP fornecido 99392978 não existe.')
  })
  describe('failures raised by a resilience policy rather than by a provider', () => {
    // These mean the upstream call never happened. Falling through to
    // ProviderFailureError would mislabel them in metrics and hide the fact
    // that no request was made — the opposite of what an operator needs.
    it('maps a tripped circuit to CircuitOpenError', () => {
      const mapped = FindNearestChurchesErrorMapper.map(new BrokenCircuitError('circuit is open'))

      expect(mapped).toBeInstanceOf(CircuitOpenError)
    })

    it('keeps a tripped circuit RETRYABLE so the chain tries the next provider', () => {
      const mapped = FindNearestChurchesErrorMapper.map(new BrokenCircuitError('circuit is open'))

      expect(mapped.failureMode).toBe(FailureMode.RETRYABLE)
    })

    it('preserves the cockatiel error as the cause', () => {
      const raw = new BrokenCircuitError('circuit is open')
      const mapped = FindNearestChurchesErrorMapper.map(raw) as CircuitOpenError

      expect(mapped.originalError).toBe(raw)
    })

    it('maps a full bulkhead to ServiceOverloadError', () => {
      const mapped = FindNearestChurchesErrorMapper.map(new BulkheadRejectedError(1, 0))

      expect(mapped).toBeInstanceOf(ServiceOverloadError)
    })

    it('still falls back to ProviderFailureError for anything else', () => {
      // The counterweight: the two new branches must not swallow ordinary
      // failures on their way to the fallback.
      const mapped = FindNearestChurchesErrorMapper.map(new Error('something else entirely'))

      expect(mapped).toBeInstanceOf(ProviderFailureError)
    })
  })
  describe('CEP extraction falls back past the word boundary', () => {
    it('recovers an 8-digit CEP embedded in a longer digit run', () => {
      // `\b\d{8}\b` cannot match inside a 9-digit run, which is exactly why the
      // second, unanchored pattern exists. Without it the CEP is lost and the
      // user is told which CEP was invalid without being told the CEP.
      const mapped = FindNearestChurchesErrorMapper.map(
        createFakeAxiosError(404, undefined, 'https://viacep.com.br/ws/123456789/json'),
      )

      expect(mapped).toBeInstanceOf(InvalidCepError)
      expect(mapped.message).toContain('12345678')
    })
  })
})
