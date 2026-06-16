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
    expect(mapped.message).toContain('ViaCEP')
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

  it('maps generic Axios error to ProviderFailureError', () => {
    const err = createFakeAxiosError(500, undefined, 'https://api.awesomeapi.com.br/12345678')
    const mapped = FindNearestChurchesErrorMapper.map(err)
    expect(mapped).toBeInstanceOf(ProviderFailureError)
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
})
