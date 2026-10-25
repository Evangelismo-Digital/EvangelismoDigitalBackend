import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

/**
 * Regression: **some nonexistent CEPs answered 503 instead of "CEP doesn't
 * exist".**
 *
 * `00000000` correctly answered 404 `INVALID_CEP`, but `99999999` answered 503
 * after ~3 s. AwesomeAPI and ViaCEP both say 99999999 does not exist, yet
 * BrasilAPI (through its crowd-sourced `open-cep` source) answers it with an
 * address in Sarandi/PR. The chain took that answer, geocoded it ~800 km from
 * any church and failed in routing. 99999-999 lies in Rio Grande do Sul's
 * Correios range, so an answer placing it in Paraná is impossible. Found by the
 * frontend's real-backend suite. Defect: fake CEP → 503 (2026-10-25).
 *
 * The fix discards an address whose state contradicts the CEP's Correios range
 * (`getStateByCep` from @brazilian-utils), so the chain moves on and ends in
 * INVALID_CEP when nobody has a consistent answer.
 *
 * Drives the real chain and decorators with only the raw providers and the
 * rate limiter replaced.
 */

const { mockTryConsume } = vi.hoisted(() => ({ mockTryConsume: vi.fn() }))

vi.mock('@infra/rate-limiter/redis-rate-limiter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@infra/rate-limiter/redis-rate-limiter')>()),
  RedisRateLimiter: { getInstance: vi.fn(() => ({ tryConsume: mockTryConsume })) },
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import type Redis from 'ioredis'
import { getStateByCep, getStates } from '@brazilian-utils/brazilian-utils'
import { ResilientAddressProvider } from './resilient-address-provider'
import { ResilientAddressProviderDecorator } from './decorators/resilient-address-provider.decorator'
import { IRawAddressProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { IAddressData } from '@infra/providers/interfaces/address-provider.interface'
import { EnumProviderConfig } from '@infra/rate-limiter/redis-rate-limiter'
import { resetProviderCircuitBreakers } from '@infra/providers/helpers/provider-circuit-breaker'
import { InvalidCepError } from '@modules/churches/errors/invalid-cep-error'
import { isErr, isOk } from '@common/utils/result'
import { logger } from '@infra/logger'

function raw(providerName: string, answer: IAddressData | null): IRawAddressProvider {
  return {
    providerName,
    rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
    timeoutMs: 2000,
    maxRetries: 1,
    backoffMs: 0,
    fetchRawAddress: vi.fn().mockResolvedValue(answer),
  }
}

function chainOf(...providers: IRawAddressProvider[]) {
  return new ResilientAddressProvider(
    providers.map((provider) => new ResilientAddressProviderDecorator(provider, {} as Redis)),
  )
}

const SARANDI_PR: IAddressData = {
  logradouro: 'Avenida das Torres',
  bairro: 'Jardim Centro Cívico',
  localidade: 'Sarandi',
  uf: 'PR',
}

describe('Regression: some nonexistent CEPs answered 503', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    mockTryConsume.mockResolvedValue(true)
  })

  it('answers INVALID_CEP for 99999999 when only BrasilAPI places it, in the wrong state', async () => {
    const viaCep = raw('ViaCEP', null)

    const result = await chainOf(raw('AwesomeAPI', null), raw('BrasilAPI', SARANDI_PR), viaCep).fetchAddress('99999999')

    expect(isErr(result) && result.error).toBeInstanceOf(InvalidCepError)
    // The contradicted answer is "not found", not the end of the chain.
    expect(viaCep.fetchRawAddress).toHaveBeenCalled()
  })

  it('logs which provider gave the contradicted answer', async () => {
    await chainOf(raw('BrasilAPI', SARANDI_PR)).fetchAddress('99999999')

    expect(logger.warn).toHaveBeenCalledWith(
      { cep: '99999999', provider: 'BrasilAPI', uf: 'PR' },
      'Endereço descartado: a UF não corresponde à faixa de CEP dos Correios',
    )
  })

  describe('counterweight: consistent answers are untouched', () => {
    it('keeps an address whose state owns the CEP range', async () => {
      const icarai = { localidade: 'Niterói', uf: 'RJ', bairro: 'Icaraí' }

      const result = await chainOf(raw('BrasilAPI', icarai)).fetchAddress('24210-201')

      expect(isOk(result) && result.value).toEqual(icarai)
    })

    it('keeps an address for a CEP outside every state range, which it cannot judge', async () => {
      const answer = { localidade: 'Cidade', uf: 'MT' }

      const result = await chainOf(raw('BrasilAPI', answer)).fetchAddress('78950000')

      expect(isOk(result) && result.value).toEqual(answer)
    })

    it('keeps an address whose state comes back lower-cased or padded', async () => {
      const answer = { localidade: 'Porto Alegre', uf: ' rs ' }

      const result = await chainOf(raw('BrasilAPI', answer)).fetchAddress('90010-000')

      expect(isOk(result) && result.value).toEqual(answer)
    })

    it('holds for any CEP: the owning state is kept, every other state is discarded', async () => {
      const codes = getStates().map((state) => state.code)

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1_000_000, max: 99_999_999 }), fc.constantFrom(...codes), async (n, uf) => {
          resetProviderCircuitBreakers()
          const cep = String(n).padStart(8, '0')
          const owner = getStateByCep(cep)?.code

          const result = await chainOf(raw('BrasilAPI', { localidade: 'X', uf })).fetchAddress(cep)

          expect(isOk(result)).toBe(owner === undefined || owner === uf)
        }),
        { numRuns: 300 },
      )
    })
  })
})
