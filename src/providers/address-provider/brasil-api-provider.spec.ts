import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ get: mockGet })),
}))

import { BrasilApiProvider } from './brasil-api-provider'
import { createHttpClient } from '@lib/http/axios'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

function build() {
  return new BrasilApiProvider({ apiUrl: 'https://brasilapi.test' })
}

const response = {
  cep: '01310100',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Bela Vista',
  street: 'Avenida Paulista',
  service: 'open-cep',
}

describe('BrasilApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes provider identity and rate-limit metadata', () => {
    const provider = build()
    expect(provider.providerName).toBe('BrasilAPI')
    expect(provider.rateLimitConfig).toBe('brasilApiAddressProvider')
  })

  it('wires the HTTP client with the base URL, a User-Agent header, a timeout and agent options', () => {
    build()

    expect(vi.mocked(createHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://brasilapi.test',
        timeout: expect.any(Number),
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
        agentOptions: expect.objectContaining({ maxSockets: expect.any(Number) }),
      }),
    )
  })

  it('strips non-digits from the CEP and forwards the abort signal', async () => {
    mockGet.mockResolvedValue({ data: response })
    const signal = new AbortController().signal

    await build().fetchRawAddress('01310-100', signal)

    expect(mockGet).toHaveBeenCalledWith('/01310100', { signal })
  })

  it('normalizes the response without coordinates (BrasilAPI has none)', async () => {
    mockGet.mockResolvedValue({ data: response })

    const result = await build().fetchRawAddress('01310100')

    expect(result).toEqual({
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
      precision: EnumGeoPrecision.ROOFTOP,
      providerName: 'BrasilAPI',
    })
    expect(result).not.toHaveProperty('lat')
  })

  it('downgrades precision to NEIGHBORHOOD when the street is empty', async () => {
    mockGet.mockResolvedValue({ data: { ...response, street: '' } })

    const result = await build().fetchRawAddress('01310100')

    expect(result?.precision).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it.each([
    ['no data', null],
    ['missing cep', { ...response, cep: '' }],
    ['missing city', { ...response, city: '' }],
    ['missing state', { ...response, state: '' }],
  ])('returns null when %s', async (_label, data) => {
    mockGet.mockResolvedValue({ data })
    expect(await build().fetchRawAddress('00000000')).toBeNull()
  })
})
