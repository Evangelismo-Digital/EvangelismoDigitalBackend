import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { CepToLatLonUseCase } from './cep-to-lat-lon-use-case'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { Redis } from 'ioredis'
import { CachedFailureError } from '@lib/infra/cache/resilient-cache'
import { IGeocodingProvider, EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { ok, errOf, isOk, isErr } from 'core/shared/result'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'

vi.mock('@lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    APP_NAME: 'Test',
  },
}))

vi.mock('@lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn(),
  }
})

const mockGetOrFetch = vi.fn()
const mockGenerateKey = vi.fn()

vi.mock('@lib/infra/cache/resilient-cache', () => {
  return {
    ResilientCache: class ResilientCacheMock {
      getOrFetch(...args: any[]) {
        return mockGetOrFetch(...args)
      }
      generateKey(...args: any[]) {
        return mockGenerateKey(...args)
      }
    },
    CachedFailureError: class CachedFailureError extends Error {
      errorType: string
      errorData: any
      constructor(type: string, message: string, data: any) {
        super(message)
        this.name = 'CachedFailureError'
        this.errorType = type
        this.errorData = data
      }
    },
  }
})

describe('CepToLatLon Use Case', () => {
  let useCase: CepToLatLonUseCase
  let addressProviderMock: { fetchAddress: Mock }
  let geocodingProviderMock: { search: Mock; searchStructured: Mock }
  let redisMock: Redis

  const defaultOptions = {
    prefix: 'test',
    defaultTtlSeconds: 60,
    negativeTtlSeconds: 10,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetOrFetch.mockReset()
    mockGenerateKey.mockReset()

    mockGetOrFetch.mockImplementation(async (_key, fetcher, _mapper) => {
      return fetcher(new AbortController().signal)
    })

    mockGenerateKey.mockImplementation(({ cep }) => `cep:${cep}`)

    addressProviderMock = { fetchAddress: vi.fn() }
    geocodingProviderMock = { search: vi.fn(), searchStructured: vi.fn() }
    redisMock = new Redis()

    useCase = new CepToLatLonUseCase(
      geocodingProviderMock as unknown as IGeocodingProvider,
      addressProviderMock as unknown as IAddressProvider,
      redisMock,
      defaultOptions as any,
    )
  })

  // ============================================================================
  // SUCCESS SCENARIOS
  // ============================================================================

  it('should format CEP correctly and use generated cache key', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({
        lat: -23,
        lon: -46,
        precision: EnumGeoPrecision.ROOFTOP,
        providerName: 'AwesomeAPI',
      }),
    )

    const result = await useCase.execute({ cep: '12.345-678' })

    expect(isOk(result)).toBe(true)
    expect(mockGenerateKey).toHaveBeenCalledWith({ cep: '12345678' })
    expect(addressProviderMock.fetchAddress).toHaveBeenCalledWith('12345678', expect.any(AbortSignal))
  })

  it('OPTIMIZATION: should return coordinates directly if AddressProvider returns them', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({
        logradouro: 'Av Paulista',
        lat: -23.56,
        lon: -46.65,
        precision: EnumGeoPrecision.ROOFTOP,
        providerName: 'AwesomeAPI',
      }),
    )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toEqual({
        userLat: -23.56,
        userLon: -46.65,
        precision: EnumGeoPrecision.ROOFTOP,
        coordinatesProviderName: 'AwesomeAPI',
      })
    }
    expect(geocodingProviderMock.search).not.toHaveBeenCalled()
  })

  it('STRATEGY A: should find coordinates using exact address (Street + City)', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({
        logradouro: 'Avenida Paulista',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    )

    geocodingProviderMock.search.mockResolvedValueOnce(
      ok({
        lat: -23.5631,
        lon: -46.6554,
        precision: EnumGeoPrecision.ROOFTOP,
        providerName: 'LocationIQ',
      }),
    )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    expect(geocodingProviderMock.search).toHaveBeenCalledWith(
      'Avenida Paulista, São Paulo - SP, Brazil',
      expect.any(AbortSignal),
    )
    if (isOk(result)) {
      expect(result.value.userLat).toBe(-23.5631)
    }
  })

  it('STRATEGY B: should fallback to neighborhood search if street search fails', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({
        logradouro: 'Rua Desconhecida',
        bairro: 'Bela Vista',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    )

    geocodingProviderMock.search
      .mockResolvedValueOnce(ok(null)) // Falha na Rua
      .mockResolvedValueOnce(
        ok({
          // Sucesso no Bairro
          lat: -23.1,
          lon: -46.2,
          precision: EnumGeoPrecision.NEIGHBORHOOD,
          providerName: 'LocationIQ',
        }),
      )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.precision).toBe(EnumGeoPrecision.NEIGHBORHOOD)
    }
    expect(geocodingProviderMock.search).toHaveBeenCalledTimes(2)
  })

  it('STRATEGY C: should fallback to structured city search if street and neighborhood fail', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({
        logradouro: 'Rua X',
        bairro: 'Bairro Y',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    )

    geocodingProviderMock.search.mockResolvedValue(ok(null)) // Falha rua e bairro
    geocodingProviderMock.searchStructured.mockResolvedValueOnce(
      ok({
        lat: -23.55,
        lon: -46.63,
        precision: EnumGeoPrecision.CITY,
        providerName: 'LocationIQ',
      }),
    )

    const result = await useCase.execute({ cep: '01000000' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.precision).toBe(EnumGeoPrecision.CITY)
    }
    expect(geocodingProviderMock.searchStructured).toHaveBeenCalled()
  })

  // ============================================================================
  // CACHE BEHAVIOR TESTS
  // ============================================================================

  it('should return cached value immediately (Cache Hit)', async () => {
    const cachedResponse = { userLat: 1, userLon: 1, precision: EnumGeoPrecision.ROOFTOP }
    mockGetOrFetch.mockResolvedValue(cachedResponse)

    const result = await useCase.execute({ cep: '00000000' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(cachedResponse)
    }
    expect(addressProviderMock.fetchAddress).not.toHaveBeenCalled()
  })

  it('should unwrap CachedFailureError back to InvalidCepError', async () => {
    const originalError = new InvalidCepError()
    const cachedError = new CachedFailureError('InvalidCepError', 'Invalid CEP', originalError)
    mockGetOrFetch.mockRejectedValue(cachedError)

    const result = await useCase.execute({ cep: '000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InvalidCepError)
    }
  })

  it('should unwrap CachedFailureError back to CoordinatesNotFoundError', async () => {
    const originalError = new CoordinatesNotFoundError()
    const cachedError = new CachedFailureError('CoordinatesNotFoundError', 'Not found', originalError)
    mockGetOrFetch.mockRejectedValue(cachedError)

    const result = await useCase.execute({ cep: '000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
    }
  })

  it('should properly map domain errors to cacheable objects', async () => {
    let capturedMapper: any
    mockGetOrFetch.mockImplementation(async (_k, fetcher, mapper) => {
      capturedMapper = mapper
      try {
        return await fetcher(new AbortController().signal)
      } catch (error) {
        // Simula getOrFetch jogando CachedFailureError
        const appErr = error as import('errors/app-error').AppError
        throw new CachedFailureError(appErr.constructor.name, appErr.message, appErr)
      }
    })

    addressProviderMock.fetchAddress.mockResolvedValue(ok(null)) // Gera InvalidCepError

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)

    expect(capturedMapper).toBeDefined()

    // Verifica se InvalidCepError retorna objeto de erro (será cacheado)
    expect(capturedMapper(new InvalidCepError())).toEqual({
      type: 'InvalidCepError',
      message: expect.any(String),
      data: expect.any(Object),
    })

    // Verifica se erro genérico retorna null (não será cacheado)
    expect(capturedMapper(new Error('DB Error'))).toBeNull()
  })

  // ============================================================================
  // ERROR HANDLING (NON-CACHED & SYSTEM ERRORS)
  // ============================================================================

  it('should return InvalidCepError when provider returns null', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok(null))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InvalidCepError)
    }
  })

  it('should return CoordinatesNotFoundError when all strategies fail', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ localidade: 'Oz', uf: 'WZ' }))
    geocodingProviderMock.search.mockResolvedValue(ok(null))
    geocodingProviderMock.searchStructured.mockResolvedValue(ok(null))

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
    }
  })

  it('should bubble up ServiceBusyError (Rate Limit)', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ logradouro: 'Rua A', localidade: 'B', uf: 'C' }))
    geocodingProviderMock.search.mockResolvedValue(errOf(new ServiceBusyError('Nominatim')))

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ServiceBusyError)
    }
  })

  it('should return generic CepToLatLonError on unexpected system failure', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      errOf(new ProviderFailureError('Mock', ProviderLayer.Address, new Error('Unknown Axios Error'))),
    )
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ProviderFailureError)
    }
  })

  it('should return CepToLatLonError if cache returns null unexpectedly', async () => {
    mockGetOrFetch.mockResolvedValue(null)
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CepToLatLonError)
      expect(result.error.message).toBe('Falha ao processar o CEP 00000000.')
    }
  })
})
