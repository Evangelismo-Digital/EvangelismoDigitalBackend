import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ get: mockGet })),
}))

import { AwesomeApiProvider } from './awesome-api-provider'
import { createHttpClient } from '@lib/http/axios'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

function build() {
  return new AwesomeApiProvider({ apiUrl: 'https://awesomeapi.test', apiToken: 'tok' })
}

const fullResponse = {
  cep: '01310-100',
  address_type: 'Avenida',
  address_name: 'Avenida Paulista',
  address: 'Avenida Paulista',
  state: 'SP',
  district: 'Bela Vista',
  lat: '-23.561684',
  lng: '-46.655981',
  city: 'São Paulo',
  city_ibge: '3550308',
  ddd: '11',
}

describe('AwesomeApiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes provider identity and rate-limit metadata', () => {
    const provider = build()
    expect(provider.providerName).toBe('AwesomeAPI')
    expect(provider.rateLimitConfig).toBe('awesomeApiAddressProvider')
  })

  it('wires the HTTP client with the base URL, a User-Agent header, a timeout and agent options', () => {
    build()

    expect(vi.mocked(createHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://awesomeapi.test',
        timeout: expect.any(Number),
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
        agentOptions: expect.objectContaining({ maxSockets: expect.any(Number) }),
      }),
    )
  })

  it('strips non-digit characters from the CEP before building the URL', async () => {
    mockGet.mockResolvedValue({ data: fullResponse })
    const signal = new AbortController().signal

    await build().fetchRawAddress('01310-100', signal)

    expect(mockGet).toHaveBeenCalledWith('/01310100', { signal })
  })

  it('normalizes the response and parses coordinates', async () => {
    mockGet.mockResolvedValue({ data: fullResponse })

    const result = await build().fetchRawAddress('01310100')

    expect(result).toEqual({
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
      lat: -23.561684,
      lon: -46.655981,
      precision: EnumGeoPrecision.ROOFTOP,
      providerName: 'AwesomeAPI',
    })
  })

  it('classifies precision as NEIGHBORHOOD when the street is absent', async () => {
    mockGet.mockResolvedValue({
      data: { ...fullResponse, address_name: '', district: 'Bela Vista' },
    })

    const result = await build().fetchRawAddress('01310100')

    expect(result?.precision).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('returns null when the payload is empty', async () => {
    mockGet.mockResolvedValue({ data: null })
    expect(await build().fetchRawAddress('00000000')).toBeNull()
  })

  it('returns null when the payload has no cep field', async () => {
    mockGet.mockResolvedValue({ data: { ...fullResponse, cep: '' } })
    expect(await build().fetchRawAddress('00000000')).toBeNull()
  })
})
