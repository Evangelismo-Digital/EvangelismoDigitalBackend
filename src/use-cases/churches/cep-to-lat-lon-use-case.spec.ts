import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { CepToLatLonUseCase } from './cep-to-lat-lon-use-case'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { IGeocodingProvider, EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { logger } from '@lib/logger'
import { Deadline } from 'core/shared/deadline'

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

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: any[]) => mockCaptureError(...args),
}))

describe('CepToLatLon Use Case', () => {
  let useCase: CepToLatLonUseCase
  let addressProviderMock: { fetchAddress: Mock }
  let geocodingProviderMock: { search: Mock; searchStructured: Mock }

  beforeEach(() => {
    vi.clearAllMocks()

    addressProviderMock = { fetchAddress: vi.fn() }
    geocodingProviderMock = { search: vi.fn(), searchStructured: vi.fn() }

    useCase = new CepToLatLonUseCase(
      geocodingProviderMock as unknown as IGeocodingProvider,
      addressProviderMock as unknown as IAddressProvider,
    )
  })

  // ============================================================================
  // SUCCESS SCENARIOS
  // ============================================================================

  it('should strip non-digits from the CEP before querying the address provider', async () => {
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
    expect(addressProviderMock.fetchAddress).toHaveBeenCalledWith('12345678', undefined)
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

  it('OPTIMIZATION: should fall back to defaults when the address provider omits precision and name', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ localidade: 'São Paulo', uf: 'SP', lat: -23, lon: -46 }))

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.precision).toBe(EnumGeoPrecision.NO_CERTAINTY)
      expect(result.value.coordinatesProviderName).toBe('Unknown')
    }
  })

  it('OPTIMIZATION: should fall through to geocoding when only one coordinate is present', async () => {
    // A latitude without a longitude is unusable — both must be present.
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ lat: -23, localidade: 'São Paulo', uf: 'SP' }))
    geocodingProviderMock.searchStructured.mockResolvedValue(
      ok({ lat: -23.5, lon: -46.6, precision: EnumGeoPrecision.CITY, providerName: 'LocationIQ' }),
    )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.userLat).toBe(-23.5)
      expect(result.value.userLon).toBe(-46.6)
    }
    expect(geocodingProviderMock.searchStructured).toHaveBeenCalled()
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
    expect(geocodingProviderMock.search).toHaveBeenCalledWith('Avenida Paulista, São Paulo - SP, Brazil', undefined)
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
    expect(geocodingProviderMock.searchStructured).toHaveBeenCalledWith(
      { city: 'São Paulo', state: 'SP', country: 'Brazil' },
      undefined,
    )
  })

  it('should fall through to the neighborhood strategy when the street search fails with NOT_FOUND', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({ logradouro: 'Rua X', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' }),
    )

    geocodingProviderMock.search
      .mockResolvedValueOnce(err(new CoordinatesNotFoundError()))
      .mockResolvedValueOnce(
        ok({ lat: -23.1, lon: -46.2, precision: EnumGeoPrecision.NEIGHBORHOOD, providerName: 'LocationIQ' }),
      )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.precision).toBe(EnumGeoPrecision.NEIGHBORHOOD)
    }
    // NOT_FOUND is a fall-through, not a terminal failure.
    expect(geocodingProviderMock.search).toHaveBeenCalledTimes(2)
  })

  it('should skip the street strategy entirely when the address has no logradouro', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' }))

    geocodingProviderMock.search.mockResolvedValueOnce(
      ok({ lat: -23.1, lon: -46.2, precision: EnumGeoPrecision.NEIGHBORHOOD, providerName: 'LocationIQ' }),
    )

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    expect(geocodingProviderMock.search).toHaveBeenCalledTimes(1)
    expect(geocodingProviderMock.search).toHaveBeenCalledWith('Centro, São Paulo - SP, Brazil', undefined)
  })

  // ============================================================================
  // SIGNAL PROPAGATION
  // ============================================================================
  //
  // This use-case no longer owns a cache, so it no longer owns a timeout
  // budget either: the caller's signal must reach every provider untouched.

  it('should forward the caller deadline to the address provider', async () => {
    const deadline = Deadline.in(Infinity, { linkedTo: new AbortController().signal })
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ lat: -23, lon: -46 }))

    await useCase.execute({ cep: '01310100', deadline })

    expect(addressProviderMock.fetchAddress).toHaveBeenCalledWith('01310100', deadline)
  })

  it('should forward the caller deadline to both geocoding strategies', async () => {
    const deadline = Deadline.in(Infinity, { linkedTo: new AbortController().signal })
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({ logradouro: 'Rua X', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP' }),
    )
    geocodingProviderMock.search.mockResolvedValue(ok(null))
    geocodingProviderMock.searchStructured.mockResolvedValue(
      ok({ lat: -23, lon: -46, precision: EnumGeoPrecision.CITY, providerName: 'LocationIQ' }),
    )

    await useCase.execute({ cep: '01310100', deadline })

    expect(geocodingProviderMock.search).toHaveBeenCalledWith(expect.any(String), deadline)
    expect(geocodingProviderMock.searchStructured).toHaveBeenCalledWith(expect.any(Object), deadline)
  })

  it('should surface a provider abort as TimeoutExceededError', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Aborted by client'))

    addressProviderMock.fetchAddress.mockImplementation(async (_cep, deadline) => {
      if (deadline?.expired) {
        return err(new TimeoutExceededError(deadline.signal.reason))
      }
      return ok(null)
    })

    const result = await useCase.execute({
      cep: '00000000',
      deadline: Deadline.in(Infinity, { linkedTo: controller.signal }),
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(TimeoutExceededError)
    }
  })

  // ============================================================================
  // ERROR HANDLING
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

  it('should bubble up ServiceBusyError (Rate Limit) instead of trying the next strategy', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(
      ok({ logradouro: 'Rua A', bairro: 'Centro', localidade: 'B', uf: 'C' }),
    )
    geocodingProviderMock.search.mockResolvedValue(err(new ServiceBusyError('Nominatim')))

    const result = await useCase.execute({ cep: '00000000' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ServiceBusyError)
    }
    // A retryable failure is terminal: the neighborhood strategy must not run.
    expect(geocodingProviderMock.search).toHaveBeenCalledTimes(1)
    expect(geocodingProviderMock.searchStructured).not.toHaveBeenCalled()
  })

  it('should bubble up an error from the structured city search', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({ localidade: 'São Paulo', uf: 'SP' }))
    geocodingProviderMock.searchStructured.mockResolvedValue(err(new ServiceBusyError('LocationIQ')))

    const result = await useCase.execute({ cep: '00000000' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ServiceBusyError)
    }
  })

  it('should propagate an address provider failure untouched', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(err(new ProviderFailureError(new Error('Unknown Axios Error'))))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ProviderFailureError)
    }
  })

  it('PARANOID GUARD: should return CepToLatLonError (a SystemError) without capturing here — the global HTTP error handler captures it once it propagates', async () => {
    addressProviderMock.fetchAddress.mockResolvedValue(ok({}))

    const result = await useCase.execute({ cep: '00000000' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CepToLatLonError)
    }
    expect(mockCaptureError).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      { cep: '00000000', city: undefined },
      'Crítico: Geocoding Provider não encontrou a cidade.',
    )
  })
})
