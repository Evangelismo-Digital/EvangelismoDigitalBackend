/**
 * Integration — the resilient ADDRESS provider chain (raw providers + resilient
 * decorators + ResilientAddressProvider) wired to a REAL Redis rate-limiter
 * (docker-compose). Only the outermost HTTP hop (axios) is stubbed.
 *
 * This is the deterministic counterpart of api-providers-fallback-strategy.e2e
 * (which hits the live APIs and is excluded from CI).
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AxiosError } from 'axios'
import type { Redis } from 'ioredis'

const { gets } = vi.hoisted(() => ({ gets: [] as Mock[] }))
vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => {
    const get = vi.fn()
    gets.push(get)
    return { get }
  }),
}))

import { AwesomeApiProvider } from './awesome-api-provider'
import { BrasilApiProvider } from './brasil-api-provider'
import { ViaCepProvider } from './viaCep-provider'
import { ResilientAddressProviderDecorator } from './decorators/resilient-address-provider.decorator'
import { ResilientAddressProvider } from './resilient-address-provider'
import { RedisRateLimiter, EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { getRedisCache, closeAllRedisConnections } from '@lib/redis/clients/clients'
import { isOk, isErr } from 'core/shared/result'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'

const CEP = '01310100'

function axiosError(status: number): AxiosError {
  return {
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    isAxiosError: true,
    response: { status, data: {}, statusText: '', headers: {}, config: { url: `/${CEP}` } as never },
    config: { url: `/${CEP}` } as never,
    toJSON: () => ({}),
  } as AxiosError
}

const AWESOME_OK = {
  cep: CEP,
  address_name: 'Avenida Paulista',
  district: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  lat: '-23.561',
  lng: '-46.656',
}
const BRASIL_OK = {
  cep: CEP,
  street: 'Avenida Paulista',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  service: 'open-cep',
}

let rlConn: Redis
let awesomeGet: Mock
let brasilGet: Mock
let viacepGet: Mock
let chain: ResilientAddressProvider

beforeAll(async () => {
  rlConn = getRedisCache()
  if (rlConn.status !== 'ready') await new Promise<void>((r) => rlConn.once('ready', () => r()))
})

beforeEach(async () => {
  gets.length = 0
  await RedisRateLimiter.destroyInstance()
  const keys = await rlConn.keys('ratelimit:*')
  if (keys.length) await rlConn.del(...keys)

  const awesome = new ResilientAddressProviderDecorator(
    new AwesomeApiProvider({ apiUrl: 'https://awesomeapi.test', apiToken: 't' }),
    rlConn,
  )
  const brasil = new ResilientAddressProviderDecorator(
    new BrasilApiProvider({ apiUrl: 'https://brasilapi.test' }),
    rlConn,
  )
  const viacep = new ResilientAddressProviderDecorator(new ViaCepProvider({ apiUrl: 'https://viacep.test' }), rlConn)
  ;[awesomeGet, brasilGet, viacepGet] = gets
  chain = new ResilientAddressProvider([awesome, brasil, viacep])
})

afterEach(async () => {
  await RedisRateLimiter.destroyInstance()
  const keys = await rlConn.keys('ratelimit:*')
  if (keys.length) await rlConn.del(...keys)
})

afterAll(async () => {
  await closeAllRedisConnections()
})

describe('ResilientAddressProvider chain (integration, real Redis rate-limiter)', () => {
  it('fast path: first provider answers, the rest are never called', async () => {
    awesomeGet.mockResolvedValue({ data: AWESOME_OK })

    const result = await chain.fetchAddress(CEP)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value?.providerName).toBe('AwesomeAPI')
    expect(brasilGet).not.toHaveBeenCalled()
    expect(viacepGet).not.toHaveBeenCalled()
  })

  it('advances past a RETRYABLE failure (HTTP 429) to the next provider', async () => {
    awesomeGet.mockRejectedValue(axiosError(429))
    brasilGet.mockResolvedValue({ data: BRASIL_OK })

    const result = await chain.fetchAddress(CEP)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value?.providerName).toBe('BrasilAPI')
    // decorator retried Awesome up to maxRetries before giving up
    expect(awesomeGet.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(viacepGet).not.toHaveBeenCalled()
  })

  it('when every provider reports 404 the chain resolves to InvalidCepError', async () => {
    awesomeGet.mockRejectedValue(axiosError(404))
    brasilGet.mockRejectedValue(axiosError(404))
    viacepGet.mockRejectedValue(axiosError(404))

    const result = await chain.fetchAddress(CEP)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(InvalidCepError)
    expect(viacepGet).toHaveBeenCalled()
  })

  it('when every provider is rate-limited the chain returns the last RETRYABLE error', async () => {
    awesomeGet.mockRejectedValue(axiosError(429))
    brasilGet.mockRejectedValue(axiosError(429))
    viacepGet.mockRejectedValue(axiosError(429))

    const result = await chain.fetchAddress(CEP)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ServiceBusyError)
      expect(result.error.failureMode).toBe('RETRYABLE')
    }
  })

  it('a real Redis rate-limit rejection on a downstream provider is treated as RETRYABLE and short-circuits it', async () => {
    // Pre-drain the shared ViaCEP bucket (configured at 1 token / 1s).
    const consumed = await RedisRateLimiter.getInstance(rlConn).tryConsume(EnumProviderConfig.VIACEP_ADDRESS)
    expect(consumed).toBe(true)

    awesomeGet.mockRejectedValue(axiosError(429))
    brasilGet.mockRejectedValue(axiosError(429))
    viacepGet.mockResolvedValue({
      data: { cep: CEP, logradouro: 'Av Paulista', bairro: 'Bela Vista', localidade: 'SP', uf: 'SP' },
    })

    const result = await chain.fetchAddress(CEP)

    // ViaCEP's decorator never issued the HTTP call — the limiter rejected it first.
    expect(viacepGet).not.toHaveBeenCalled()
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
  })
})
