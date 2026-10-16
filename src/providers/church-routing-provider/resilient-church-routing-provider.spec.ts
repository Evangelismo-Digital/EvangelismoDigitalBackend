import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/metrics/provider-metrics', () => ({
  collectMetricsProviderLatency: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsProviderFallback: { inc: vi.fn() },
  collectMetricsProviderChainExhausted: { inc: vi.fn() },
  recordProviderRequest: vi.fn(),
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { ResilientChurchRoutingProvider } from './resilient-church-routing-provider'
import { NoRoutingProviderError } from './error/no-routing-provider-error'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { Deadline } from 'core/shared/deadline'
import { logger } from '@lib/logger'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { collectMetricsProviderFallback } from '@lib/metrics/provider-metrics'

const origin = { lat: -22.91, lon: -43.1 }
const destinations = [
  { lat: -22.9, lon: -43.11 },
  { lat: -22.89, lon: -43.12 },
]
const MATRIX: RouteDistanceResult[] = [
  { distance: 0.98, status: 0 },
  { distance: 3.25, status: 0 },
]

function provider(name: string): IChurchRoutingProvider & { providerName: string } {
  return { providerName: name, getDistances: vi.fn() }
}

describe('ResilientChurchRoutingProvider', () => {
  let stadia: ReturnType<typeof provider>
  let ors: ReturnType<typeof provider>

  beforeEach(() => {
    vi.clearAllMocks()
    stadia = provider('Stadia Maps')
    ors = provider('OpenRouteService')
  })

  const chain = () => new ResilientChurchRoutingProvider([stadia, ors])

  it('refuses to be built without providers', () => {
    expect(() => new ResilientChurchRoutingProvider([])).toThrow(NoRoutingProviderError)
  })

  it('answers from the first provider and never asks the second', async () => {
    vi.mocked(stadia.getDistances).mockResolvedValue(ok(MATRIX))

    const result = await chain().getDistances({ origin, destinations })

    expect(result).toEqual(ok(MATRIX))
    expect(ors.getDistances).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      { provider: 'Stadia Maps' },
      'Distâncias obtidas com sucesso por um provedor de rotas',
    )
  })

  it.each([
    ['a provider failure (e.g. a 403 plan without matrix access)', new ProviderFailureError()],
    ['a rate limit', new ServiceBusyError('Stadia Maps')],
  ])('falls through to the next provider on %s', async (_label, error) => {
    vi.mocked(stadia.getDistances).mockResolvedValue(err(error))
    vi.mocked(ors.getDistances).mockResolvedValue(ok(MATRIX))

    const result = await chain().getDistances({ origin, destinations })

    expect(result).toEqual(ok(MATRIX))
    expect(collectMetricsProviderFallback?.inc).toHaveBeenCalledWith({
      layer: 'routing',
      from_provider: 'Stadia Maps',
      to_provider: 'OpenRouteService',
    })
  })

  it('returns an all-unreachable matrix as the answer instead of falling through', async () => {
    // "Nothing within walking reach" is an answer, not a failure: asking a
    // second provider would spend its quota to hear the same thing.
    const unreachable = destinations.map(() => ({ distance: null, status: 404 }))
    vi.mocked(stadia.getDistances).mockResolvedValue(ok(unreachable))

    const result = await chain().getDistances({ origin, destinations })

    expect(result).toEqual(ok(unreachable))
    expect(ors.getDistances).not.toHaveBeenCalled()
  })

  it('bails without asking the next provider on a non-retryable failure', async () => {
    const permanent = new NoNearbyChurchesFoundError()
    vi.mocked(stadia.getDistances).mockResolvedValue(err(permanent))

    const result = await chain().getDistances({ origin, destinations })

    expect(isErr(result) && result.error).toBe(permanent)
    expect(ors.getDistances).not.toHaveBeenCalled()
  })

  it('returns the last retryable error once every provider has failed', async () => {
    const lastError = new ServiceBusyError('OpenRouteService')
    vi.mocked(stadia.getDistances).mockResolvedValue(err(new ProviderFailureError()))
    vi.mocked(ors.getDistances).mockResolvedValue(err(lastError))

    const result = await chain().getDistances({ origin, destinations })

    expect(isErr(result) && result.error).toBe(lastError)
    expect(logger.error).toHaveBeenCalledWith(
      { provider: 'OpenRouteService', error: lastError },
      'Cálculo de rotas falhou com erros de sistema',
    )
  })

  it('reports "no nearby churches" when every provider says NOT_FOUND', async () => {
    vi.mocked(stadia.getDistances).mockResolvedValue(err(new CoordinatesNotFoundError()))
    vi.mocked(ors.getDistances).mockResolvedValue(err(new CoordinatesNotFoundError()))

    const result = await chain().getDistances({ origin, destinations })

    expect(isErr(result) && result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
  })

  describe('narration', () => {
    it('logs a retryable failure before moving on', async () => {
      const failure = new ProviderFailureError()
      vi.mocked(stadia.getDistances).mockResolvedValue(err(failure))
      vi.mocked(ors.getDistances).mockResolvedValue(ok(MATRIX))

      await chain().getDistances({ origin, destinations })

      expect(logger.warn).toHaveBeenCalledWith(
        { provider: 'Stadia Maps', attempt: 1, error: failure },
        'Provedor de rotas retornou erro recuperável. Alternando para o próximo provedor...',
      )
    })

    it('logs a fatal failure when it aborts the chain', async () => {
      const permanent = new NoNearbyChurchesFoundError()
      vi.mocked(stadia.getDistances).mockResolvedValue(err(permanent))

      await chain().getDistances({ origin, destinations })

      expect(logger.error).toHaveBeenCalledWith(
        { provider: 'Stadia Maps', error: permanent },
        'Provedor de rotas retornou erro fatal. Abortando cadeia.',
      )
    })

    it('logs each NOT_FOUND and the final "nothing found"', async () => {
      vi.mocked(stadia.getDistances).mockResolvedValue(err(new CoordinatesNotFoundError()))
      vi.mocked(ors.getDistances).mockResolvedValue(err(new CoordinatesNotFoundError()))

      await chain().getDistances({ origin, destinations })

      expect(logger.info).toHaveBeenCalledWith({ provider: 'Stadia Maps' }, 'Rotas não encontradas - tentando próximo')
      expect(logger.info).toHaveBeenCalledWith(
        { provider: 'OpenRouteService' },
        'Rotas não encontradas - tentando próximo',
      )
      expect(logger.warn).toHaveBeenCalledWith(
        { notFoundCount: 2, totalProviders: 2 },
        'Nenhum provedor de rotas retornou resultados',
      )
    })

    it('logs a null answer and keeps walking', async () => {
      // Not produced by today's providers, but the chain contract allows it.
      vi.mocked(stadia.getDistances).mockResolvedValue(ok(null as unknown as RouteDistanceResult[]))
      vi.mocked(ors.getDistances).mockResolvedValue(ok(MATRIX))

      const result = await chain().getDistances({ origin, destinations })

      expect(result).toEqual(ok(MATRIX))
      expect(logger.info).toHaveBeenCalledWith(
        { provider: 'Stadia Maps' },
        'Provedor de rotas retornou null - tentando próximo',
      )
    })
  })

  it('asks nobody once the budget is already spent', async () => {
    const controller = new AbortController()
    controller.abort('too slow')

    const result = await chain().getDistances({
      origin,
      destinations,
      deadline: Deadline.in(Infinity, { linkedTo: controller.signal }),
    })

    expect(isErr(result) && result.error).toBeInstanceOf(DeadlineExceededError)
    expect(stadia.getDistances).not.toHaveBeenCalled()
    expect(ors.getDistances).not.toHaveBeenCalled()
  })

  it('forwards the request and the shared deadline to each provider', async () => {
    const deadline = Deadline.in(10_000)
    vi.mocked(stadia.getDistances).mockResolvedValue(err(new ProviderFailureError()))
    vi.mocked(ors.getDistances).mockResolvedValue(ok(MATRIX))

    const result = await chain().getDistances({
      origin,
      destinations,
      profile: RoutingProfile.BICYCLE,
      deadline,
    })

    expect(isOk(result)).toBe(true)
    for (const asked of [stadia, ors]) {
      expect(asked.getDistances).toHaveBeenCalledWith({
        origin,
        destinations,
        profile: RoutingProfile.BICYCLE,
        deadline,
      })
    }
  })

  it('supplies an open-ended deadline when the caller gives none', async () => {
    vi.mocked(stadia.getDistances).mockResolvedValue(ok(MATRIX))

    await chain().getDistances({ origin, destinations })

    const { deadline } = vi.mocked(stadia.getDistances).mock.calls[0][0]
    expect(deadline).toBeInstanceOf(Deadline)
    expect(deadline?.expired).toBe(false)
  })
})
