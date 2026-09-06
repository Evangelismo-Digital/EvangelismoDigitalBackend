import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Regression: **an exhausted budget kept the fallback chain walking.**
 *
 * A spent request budget surfaced as `TimeoutExceededError`, which is
 * `RETRYABLE` — the same classification a single slow provider gets. The chains
 * route on `failureMode`, so they dutifully advanced to the next provider, and
 * the next, each one consuming a rate-limit point against a scarce upstream
 * only to fail instantly on the very same expired clock.
 *
 * `DeadlineExceededError` now carries `FailureMode.ABORTED`, which is terminal:
 * there is no time left to hear any answer, so no one else is asked.
 * Defect D8 in docs/timeout-and-cancellation-model.md.
 */

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/metrics/provider-metrics', () => ({
  collectMetricsProviderLatency: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsProviderFallback: { inc: vi.fn() },
  collectMetricsProviderChainExhausted: { inc: vi.fn() },
  recordProviderRequest: vi.fn(),
}))

import { ResilientGeoProvider } from './resilient-geo-provider'
import { ResilientAddressProvider } from 'providers/address-provider/resilient-address-provider'
import { IGeocodingProvider, EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Deadline } from 'core/shared/deadline'
import { ok, err, isErr } from 'core/shared/result'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

const coords = { lat: -23.55, lon: -46.63, precision: EnumGeoPrecision.ROOFTOP }
const address = { localidade: 'São Paulo', uf: 'SP' }

describe('regression: a spent budget must stop the chain, not walk it', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies a spent budget as terminal, never as retryable', () => {
    // The root cause in one line: this used to be RETRYABLE.
    expect(new DeadlineExceededError('DEADLINE_EXPIRED').failureMode).toBe(FailureMode.ABORTED)
  })

  describe('geocoding chain', () => {
    it('asks no further provider once one reports a spent budget', async () => {
      const first: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }
      const second: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }
      const third: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }

      vi.mocked(first.search).mockResolvedValue(err(new DeadlineExceededError('DEADLINE_EXPIRED')))
      vi.mocked(second.search).mockResolvedValue(ok(coords))
      vi.mocked(third.search).mockResolvedValue(ok(coords))

      const result = await new ResilientGeoProvider([first, second, third]).search('Av Paulista')

      expect(isErr(result)).toBe(true)
      expect(second.search).not.toHaveBeenCalled()
      expect(third.search).not.toHaveBeenCalled()
    })

    it('still advances on a genuinely retryable failure', async () => {
      // The counterweight: bailing on ABORTED must not have broken fallback.
      const first: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }
      const second: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }

      vi.mocked(first.search).mockResolvedValue(err(new ServiceBusyError('LocationIQ')))
      vi.mocked(second.search).mockResolvedValue(ok(coords))

      const result = await new ResilientGeoProvider([first, second]).search('Av Paulista')

      expect(isErr(result)).toBe(false)
      expect(second.search).toHaveBeenCalledOnce()
    })

    it('does not even start the first provider when the budget is already gone', async () => {
      const only: IGeocodingProvider = { search: vi.fn(), searchStructured: vi.fn() }

      const result = await new ResilientGeoProvider([only]).search('Av Paulista', Deadline.in(0))

      expect(only.search).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }
    })
  })

  describe('address chain', () => {
    it('asks no further provider once one reports a spent budget', async () => {
      const first: IAddressProvider = { fetchAddress: vi.fn() }
      const second: IAddressProvider = { fetchAddress: vi.fn() }

      vi.mocked(first.fetchAddress).mockResolvedValue(err(new DeadlineExceededError('DEADLINE_EXPIRED')))
      vi.mocked(second.fetchAddress).mockResolvedValue(ok(address))

      const result = await new ResilientAddressProvider([first, second]).fetchAddress('01310100')

      expect(isErr(result)).toBe(true)
      expect(second.fetchAddress).not.toHaveBeenCalled()
    })

    it('does not even start the first provider when the budget is already gone', async () => {
      const only: IAddressProvider = { fetchAddress: vi.fn() }

      const result = await new ResilientAddressProvider([only]).fetchAddress('01310100', Deadline.in(0))

      expect(only.fetchAddress).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
    })
  })
})
