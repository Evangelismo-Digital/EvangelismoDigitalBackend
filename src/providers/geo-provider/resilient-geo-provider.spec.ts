import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/metrics/provider-metrics', () => ({
  collectMetricsProviderLatency: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsProviderFallback: { inc: vi.fn() },
  collectMetricsProviderChainExhausted: { inc: vi.fn() },
  recordProviderRequest: vi.fn(),
}))

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
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { Deadline } from 'core/shared/deadline'
import { logger } from '@lib/logger'
import { ok, err, isOk, isErr } from 'core/shared/result'
import {
  collectMetricsProviderLatency as latencyMetric,
  collectMetricsProviderFallback as fallbackMetric,
  collectMetricsProviderChainExhausted as exhaustedMetric,
} from '@lib/metrics/provider-metrics'

// These exports are nullable in production (null when METRICS_ENABLED=false),
// but this file always mocks them — narrow once here rather than at every call.
const collectMetricsProviderLatency = latencyMetric!
const collectMetricsProviderFallback = fallbackMetric!
const collectMetricsProviderChainExhausted = exhaustedMetric!

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
      expect(provider1.search).toHaveBeenCalledWith('Av Paulista', expect.any(Deadline))
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
      expect(provider1.searchStructured).toHaveBeenCalledWith(mockSearchOptions, expect.any(Deadline))
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

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new CoordinatesNotFoundError()))
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

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
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
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new CoordinatesNotFoundError()))

      const result = await provider.search('Nowhere')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
      }
    })

    it('should return ServiceBusyError if the last provider had a ServiceBusy error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new ProviderFailureError(new Error('Connection timeout'))))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if the last provider had a non-busy System Error', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ProviderFailureError(new Error('Connection timeout'))))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ANY provider had a System Error and last was ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError if ANY provider had a non-busy System Error and last was not ServiceBusy, even if others said Not Found', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(ok(null))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ProviderFailureError(new Error('Network error'))))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('should return ServiceBusyError if ALL providers have ServiceBusy errors', async () => {
      const provider = createProvider()

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider2')))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ServiceBusyError)
      }
    })

    it('should return ProviderFailureError with wrapped error when last error is generic system error', async () => {
      const provider = createProvider()
      const systemError = new Error('Database connection failed')

      vi.spyOn(provider1, 'search').mockResolvedValue(err(new ServiceBusyError('MockProvider1')))
      vi.spyOn(provider2, 'search').mockResolvedValue(err(new ProviderFailureError(systemError)))

      const result = await provider.search('Query')
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
      }
    })

    it('bails on an ABORTED failure without asking the next provider', async () => {
      // A spent request budget is terminal: every remaining provider would
      // fail identically and instantly, so the chain must not walk them.
      const aborted = new DeadlineExceededError('DEADLINE_EXPIRED')
      vi.mocked(provider1.search).mockResolvedValue(err(aborted))
      vi.mocked(provider2.search).mockResolvedValue(ok(mockCoords))

      const result = await createProvider().search('query')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBe(aborted)
      }
      expect(provider2.search).not.toHaveBeenCalled()
    })

    it('contrasts with RETRYABLE, which does advance to the next provider', async () => {
      vi.mocked(provider1.search).mockResolvedValue(err(new ServiceBusyError('LocationIQ')))
      vi.mocked(provider2.search).mockResolvedValue(ok(mockCoords))

      const result = await createProvider().search('query')

      expect(isOk(result)).toBe(true)
      expect(provider2.search).toHaveBeenCalledOnce()
    })

    // Behaviour change (D8): an exhausted budget is ABORTED and terminal, not a
    // RETRYABLE timeout — the chain must not walk the remaining providers.
    it('should stop immediately and report the spent budget if the deadline is already expired', async () => {
      const provider = createProvider()
      const controller = new AbortController()
      controller.abort(new Error('Timeout'))

      const result = await provider.search('Query', Deadline.in(Infinity, { linkedTo: controller.signal }))
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }

      expect(provider1.search).not.toHaveBeenCalled()
    })
  })

  describe('observability contracts', () => {
    it('times every provider attempt under its own name and the geocoding layer', async () => {
      vi.mocked(provider1.search).mockResolvedValue(err(new ServiceBusyError('LocationIQ')))
      vi.mocked(provider2.search).mockResolvedValue(ok(mockCoords))
      const named1 = Object.assign(provider1, { providerName: 'LocationIQ' })
      const named2 = Object.assign(provider2, { providerName: 'Nominatim' })

      await new ResilientGeoProvider([named1, named2]).search('Av Paulista')

      expect(collectMetricsProviderLatency.startTimer).toHaveBeenCalledWith({
        provider: 'LocationIQ',
        layer: 'geocoding',
      })
      expect(collectMetricsProviderLatency.startTimer).toHaveBeenCalledWith({
        provider: 'Nominatim',
        layer: 'geocoding',
      })
    })

    it('records the fallback transition with both provider names', async () => {
      const named1 = Object.assign(provider1, { providerName: 'LocationIQ' })
      const named2 = Object.assign(provider2, { providerName: 'Nominatim' })
      vi.mocked(named1.search).mockResolvedValue(err(new ServiceBusyError('LocationIQ')))
      vi.mocked(named2.search).mockResolvedValue(ok(mockCoords))

      await new ResilientGeoProvider([named1, named2]).search('Av Paulista')

      expect(collectMetricsProviderFallback.inc).toHaveBeenCalledWith({
        layer: 'geocoding',
        from_provider: 'LocationIQ',
        to_provider: 'Nominatim',
      })
    })

    it('records no fallback when the last provider is the one that failed', async () => {
      const named1 = Object.assign(provider1, { providerName: 'LocationIQ' })
      vi.mocked(named1.search).mockResolvedValue(err(new ServiceBusyError('LocationIQ')))

      await new ResilientGeoProvider([named1]).search('Av Paulista')

      // There is no next provider to fall back to.
      expect(collectMetricsProviderFallback.inc).not.toHaveBeenCalled()
      expect(collectMetricsProviderChainExhausted.inc).toHaveBeenCalledWith({ layer: 'geocoding' })
    })

    it('does not count a chain as exhausted when a provider answered', async () => {
      vi.mocked(provider1.search).mockResolvedValue(ok(mockCoords))

      await createProvider().search('Av Paulista')

      expect(collectMetricsProviderChainExhausted.inc).not.toHaveBeenCalled()
    })
  })

  describe('diagnostic log contract', () => {
    // These logs are how a provider degradation is diagnosed in production, so
    // both the message and the context they carry are part of the contract.
    it('names the provider that answered', async () => {
      const named = Object.assign(provider1, { providerName: 'LocationIQ' })
      vi.mocked(named.search).mockResolvedValue(ok(mockCoords))

      await new ResilientGeoProvider([named]).search('Av Paulista')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ' }),
        expect.stringContaining('sucesso'),
      )
    })

    it('names the provider that returned nothing', async () => {
      const named = Object.assign(provider1, { providerName: 'LocationIQ' })
      vi.mocked(named.search).mockResolvedValue(ok(null))

      await new ResilientGeoProvider([named]).search('Av Paulista')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ' }),
        expect.stringContaining('não encontrado'),
      )
    })

    it('names the provider that reported NOT_FOUND', async () => {
      const named = Object.assign(provider1, { providerName: 'LocationIQ' })
      vi.mocked(named.search).mockResolvedValue(err(new CoordinatesNotFoundError()))

      await new ResilientGeoProvider([named]).search('Av Paulista')

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ' }),
        expect.stringContaining('não encontradas'),
      )
    })

    it('warns with the provider, attempt number and error when falling back', async () => {
      const named1 = Object.assign(provider1, { providerName: 'LocationIQ' })
      const named2 = Object.assign(provider2, { providerName: 'Nominatim' })
      const busy = new ServiceBusyError('LocationIQ')
      vi.mocked(named1.search).mockResolvedValue(err(busy))
      vi.mocked(named2.search).mockResolvedValue(ok(mockCoords))

      await new ResilientGeoProvider([named1, named2]).search('Av Paulista')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ', attempt: 1, error: busy }),
        expect.stringContaining('recuperável'),
      )
    })

    it('logs the fatal error that aborted the chain', async () => {
      const named = Object.assign(provider1, { providerName: 'LocationIQ' })
      const fatal = new DeadlineExceededError('DEADLINE_EXPIRED')
      vi.mocked(named.search).mockResolvedValue(err(fatal))

      await new ResilientGeoProvider([named, provider2]).search('Av Paulista')

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ', error: fatal }),
        expect.stringContaining('Abortando'),
      )
    })

    it('reports how many providers found nothing when all of them did', async () => {
      vi.mocked(provider1.search).mockResolvedValue(ok(null))
      vi.mocked(provider2.search).mockResolvedValue(ok(null))

      await createProvider().search('Av Paulista')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ notFoundCount: 2, totalProviders: 2 }),
        expect.stringContaining('Nenhum provedor'),
      )
    })

    it('reports the provider and error when the chain is exhausted by failures', async () => {
      const named = Object.assign(provider1, { providerName: 'LocationIQ' })
      const busy = new ServiceBusyError('LocationIQ')
      vi.mocked(named.search).mockResolvedValue(err(busy))

      await new ResilientGeoProvider([named]).search('Av Paulista')

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'LocationIQ', error: busy }),
        expect.stringContaining('erros de sistema'),
      )
    })
  })
})
