import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { ResilientGeoProvider } from './resilient-geo-provider'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  EnumGeoPrecision,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ok, errOf, isOk, isErr } from 'core/shared/result'

const mockCoords: IGeoCoordinates = {
  lat: -23.55052,
  lon: -46.633308,
  precision: EnumGeoPrecision.ROOFTOP,
  providerName: 'MockProvider',
}

const mockSearchOptions: IGeoSearchOptions = {
  street: 'Av Paulista',
  city: 'São Paulo',
  state: 'SP',
  country: 'BR',
}

describe('ResilientGeoProvider Unit Tests', () => {
  let provider1: IGeocodingProvider
  let provider2: IGeocodingProvider

  beforeEach(() => {
    vi.clearAllMocks()

    provider1 = { search: vi.fn(), searchStructured: vi.fn() }
    provider2 = { search: vi.fn(), searchStructured: vi.fn() }
  })

  const createProvider = (providers = [provider1, provider2]) => {
    return new ResilientGeoProvider(providers)
  }

  describe('Constructor', () => {
    it('should throw NoGeoProviderError if providers list is empty', () => {
      expect(() => createProvider([])).toThrow(NoGeoProviderError)
    })

    it('should initialize successfully with valid providers', () => {
      const provider = createProvider()
      expect(provider).toBeInstanceOf(ResilientGeoProvider)
    })
  })

  describe('search', () => {
    it('should return coordinates from the first provider', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(mockCoords))

      const result = await provider.search('Av Paulista')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider1.search).toHaveBeenCalledWith('Av Paulista', expect.any(AbortSignal))
    })
  })

  describe('searchStructured', () => {
    it('should return coordinates from the first provider', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'searchStructured').mockResolvedValue(ok(mockCoords))

      const result = await provider.searchStructured(mockSearchOptions)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider1.searchStructured).toHaveBeenCalledWith(mockSearchOptions, expect.any(AbortSignal))
    })
  })

  describe('executeStrategy (Provider Logic)', () => {
    it('should return result immediately if first provider succeeds', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(mockCoords))

      const result = await provider.search('Query')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider1.search).toHaveBeenCalled()
      expect(provider2.search).not.toHaveBeenCalled()
    })

    it('should fallback to second provider if first returns NULL (not found)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(ok(mockCoords))

      const result = await provider.search('Query')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider1.search).toHaveBeenCalled()
      expect(provider2.search).toHaveBeenCalled()
    })

    it('should fallback to second provider if first throws CoordinatesNotFoundError', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(errOf(new CoordinatesNotFoundError()))
      vi.spyOn(provider2, 'search').mockResolvedValue(ok(mockCoords))

      const result = await provider.search('Query')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider2.search).toHaveBeenCalled()
    })

    it('should fallback to second provider if first fails with System Error (Busy/Generic)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(ok(mockCoords))

      const result = await provider.search('Query')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toEqual(mockCoords)
      }
      expect(provider2.search).toHaveBeenCalled()
    })

    it('should throw CoordinatesNotFoundError if ALL providers return not found (null/CoordinatesNotFoundError)', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(errOf(new CoordinatesNotFoundError()))

      const result = await provider.search('Nowhere')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
      }
    })

    it('should return ServiceBusyError if the last provider had a ServiceBusy error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(
        errOf(new ProviderFailureError('MockProvider1', ProviderLayer.Geo, new Error('Connection timeout'))),
      )
      vi.spyOn(provider2, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if the last provider had a non-busy System Error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(
        errOf(new ProviderFailureError('MockProvider2', ProviderLayer.Geo, new Error('Connection timeout'))),
      )

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ANY provider had a System Error and last was ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if ANY provider had a non-busy System Error and last was not ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(
        errOf(new ProviderFailureError('MockProvider2', ProviderLayer.Geo, new Error('Network error'))),
      )

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ALL providers have ServiceBusy errors', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError with wrapped error when last error is generic system error', async () => {
      const provider = createProvider()
      const systemError = new Error('Database connection failed')

      vi.spyOn(provider1, 'search').mockResolvedValue(errOf(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(errOf(new ProviderFailureError('MockProvider2', ProviderLayer.Geo, systemError)))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should stop immediately and return TimeoutExceededError if signal is aborted', async () => {
      const provider = createProvider()
      const controller = new AbortController()
      controller.abort(new Error('Timeout'))

      const result = await provider.search('Query', controller.signal)
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(TimeoutExceededError)
      }

      expect(provider1.search).not.toHaveBeenCalled()
    })
  })
})
