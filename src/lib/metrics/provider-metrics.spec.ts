import { vi, describe, it, expect, beforeEach } from 'vitest'

// Habilita métricas: o registry lê env de '@env/index'.
vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
  },
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock do rate-limiter usado apenas pelo decorator de routing.
const mockTryConsume = vi.fn()
vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  RedisRateLimiter: {
    getInstance: () => ({ tryConsume: mockTryConsume }),
  },
  EnumProviderConfig: { STADIA_ROUTING: 'stadiaRoutingProvider' },
}))

// Imports reais após os mocks
import type { Metric } from 'prom-client'
import { ResilientAddressProvider } from 'providers/address-provider/resilient-address-provider'
import { ResilientGeoProvider } from 'providers/geo-provider/resilient-geo-provider'
import { ResilientChurchRoutingProviderDecorator } from 'providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IGeoCoordinates, IGeocodingProvider } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { getRegistry } from '@lib/metrics'
import {
  collectMetricsProviderRequest,
  collectMetricsProviderFallback,
  collectMetricsProviderChainExhausted,
  collectMetricsProviderLatency,
} from '@lib/metrics/provider-metrics'

const ADDRESS = {} as IAddressData
const COORDS = {} as IGeoCoordinates

async function metricValue(metric: Metric | null, labels: Record<string, string>, suffix?: string): Promise<number> {
  if (!metric) return 0
  const data = await (
    metric as unknown as {
      get: () => Promise<{
        values: Array<{ value: number; labels: Record<string, string>; metricName?: string }>
      }>
    }
  ).get()
  const match = data.values.find(
    (v) =>
      (suffix ? v.metricName?.endsWith(suffix) : true) &&
      Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  )
  return match?.value ?? 0
}

function fakeAddressProvider(name: string, outcome: Result<IAddressData | null, AppError>): IAddressProvider {
  return { providerName: name, fetchAddress: async () => outcome } as unknown as IAddressProvider
}

function fakeGeoProvider(name: string, outcome: Result<IGeoCoordinates | null, AppError>): IGeocodingProvider {
  return {
    providerName: name,
    search: async () => outcome,
    searchStructured: async () => outcome,
  } as unknown as IGeocodingProvider
}

describe('Provider metrics instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()
  })

  describe('address chain — per-request result label', () => {
    it('records success for an ok value', async () => {
      const chain = new ResilientAddressProvider([fakeAddressProvider('AwesomeAPI', ok(ADDRESS))])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'AwesomeAPI',
          layer: 'address',
          result: 'success',
        }),
      ).toBe(1)
    })

    it('records not_found for an ok(null)', async () => {
      const chain = new ResilientAddressProvider([fakeAddressProvider('ViaCEP', ok(null))])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderRequest, { provider: 'ViaCEP', layer: 'address', result: 'not_found' }),
      ).toBe(1)
    })

    it('records rate_limited for a ServiceBusyError', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', err(new ServiceBusyError('AwesomeAPI'))),
      ])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'AwesomeAPI',
          layer: 'address',
          result: 'rate_limited',
        }),
      ).toBe(1)
    })

    it('records timeout for a TimeoutExceededError', async () => {
      const chain = new ResilientAddressProvider([fakeAddressProvider('ViaCEP', err(new TimeoutExceededError()))])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderRequest, { provider: 'ViaCEP', layer: 'address', result: 'timeout' }),
      ).toBe(1)
    })

    it('records deadline_exceeded for a DeadlineExceededError, not timeout', async () => {
      // The whole point of the separate error: a spent request budget and a
      // slow single attempt must not collapse into one metric label.
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', err(new DeadlineExceededError('DEADLINE_EXPIRED'))),
      ])
      await chain.fetchAddress('01001000')

      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'AwesomeAPI',
          layer: 'address',
          result: 'deadline_exceeded',
        }),
      ).toBe(1)
      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'AwesomeAPI',
          layer: 'address',
          result: 'timeout',
        }),
      ).toBe(0)
    })

    it('records provider_error for a ProviderFailureError', async () => {
      const chain = new ResilientAddressProvider([fakeAddressProvider('BrasilAPI', err(new ProviderFailureError()))])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'BrasilAPI',
          layer: 'address',
          result: 'provider_error',
        }),
      ).toBe(1)
    })
  })

  describe('address chain — fallback and exhaustion', () => {
    it('records one fallback transition when a RETRYABLE error advances to the next provider', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', err(new ServiceBusyError('AwesomeAPI'))),
        fakeAddressProvider('ViaCEP', ok(ADDRESS)),
      ])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderFallback, {
          layer: 'address',
          from_provider: 'AwesomeAPI',
          to_provider: 'ViaCEP',
        }),
      ).toBe(1)
    })

    it('does NOT record a fallback when a not-found advances to the next provider', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', ok(null)),
        fakeAddressProvider('ViaCEP', ok(ADDRESS)),
      ])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderFallback, {
          layer: 'address',
          from_provider: 'AwesomeAPI',
          to_provider: 'ViaCEP',
        }),
      ).toBe(0)
    })

    it('records chain-exhausted when all providers fail with RETRYABLE errors', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', err(new ServiceBusyError('AwesomeAPI'))),
        fakeAddressProvider('ViaCEP', err(new ServiceBusyError('ViaCEP'))),
      ])
      await chain.fetchAddress('01001000')
      expect(await metricValue(collectMetricsProviderChainExhausted, { layer: 'address' })).toBe(1)
    })

    it('does NOT record chain-exhausted when all providers return not-found', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', ok(null)),
        fakeAddressProvider('ViaCEP', ok(null)),
      ])
      await chain.fetchAddress('01001000')
      expect(await metricValue(collectMetricsProviderChainExhausted, { layer: 'address' })).toBe(0)
    })

    it('observes latency once per provider attempt', async () => {
      const chain = new ResilientAddressProvider([
        fakeAddressProvider('AwesomeAPI', err(new ServiceBusyError('AwesomeAPI'))),
        fakeAddressProvider('ViaCEP', ok(ADDRESS)),
      ])
      await chain.fetchAddress('01001000')
      expect(
        await metricValue(collectMetricsProviderLatency, { provider: 'AwesomeAPI', layer: 'address' }, '_count'),
      ).toBe(1)
      expect(await metricValue(collectMetricsProviderLatency, { provider: 'ViaCEP', layer: 'address' }, '_count')).toBe(
        1,
      )
    })
  })

  describe('geocoding chain', () => {
    it('records a fallback + success across the geocoding layer', async () => {
      const chain = new ResilientGeoProvider([
        fakeGeoProvider('Nominatim', err(new ServiceBusyError('Nominatim'))),
        fakeGeoProvider('LocationIQ', ok(COORDS)),
      ])
      await chain.search('Rua X')
      expect(
        await metricValue(collectMetricsProviderFallback, {
          layer: 'geocoding',
          from_provider: 'Nominatim',
          to_provider: 'LocationIQ',
        }),
      ).toBe(1)
      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'LocationIQ',
          layer: 'geocoding',
          result: 'success',
        }),
      ).toBe(1)
    })
  })

  describe('routing decorator', () => {
    function makeRawRouting(): IRawChurchRoutingProvider {
      return {
        providerName: 'Stadia Maps',
        rateLimitConfig: 'stadiaRoutingProvider',
        timeoutMs: 1000,
        maxRetries: 2,
        backoffMs: 10,
        fetchRawDistances: vi.fn().mockResolvedValue([{ distance: 100 }]),
      } as unknown as IRawChurchRoutingProvider
    }

    const params = { origin: { lat: 0, lon: 0 }, destinations: [{ lat: 1, lon: 1 }] }

    it('records success + latency when the raw call resolves', async () => {
      mockTryConsume.mockResolvedValue(true)
      const decorator = new ResilientChurchRoutingProviderDecorator(makeRawRouting(), null as never)

      await decorator.getDistances(params)

      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'Stadia Maps',
          layer: 'routing',
          result: 'success',
        }),
      ).toBe(1)
      expect(
        await metricValue(collectMetricsProviderLatency, { provider: 'Stadia Maps', layer: 'routing' }, '_count'),
      ).toBe(1)
    })

    it('records rate_limited when the limiter rejects', async () => {
      mockTryConsume.mockResolvedValue(false)
      const decorator = new ResilientChurchRoutingProviderDecorator(makeRawRouting(), null as never)

      await decorator.getDistances(params)

      expect(
        await metricValue(collectMetricsProviderRequest, {
          provider: 'Stadia Maps',
          layer: 'routing',
          result: 'rate_limited',
        }),
      ).toBe(1)
    })
  })
})
