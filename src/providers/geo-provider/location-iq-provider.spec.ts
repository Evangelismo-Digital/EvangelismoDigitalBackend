import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ get: mockGet })),
}))

import { LocationIqProvider } from './location-iq-provider'
import { createHttpClient } from '@lib/http/axios'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

function build() {
  return new LocationIqProvider({ apiUrl: 'https://locationiq.test', apiToken: 'tok' })
}

describe('LocationIqProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes provider identity and rate-limit metadata', () => {
    const provider = build()
    expect(provider.providerName).toBe('LocationIQ')
    expect(provider.rateLimitConfig).toBe('locationIqGeocodingProvider')
  })

  it('wires the HTTP client with the base URL, auth token param, a timeout and agent options', () => {
    build()

    expect(vi.mocked(createHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://locationiq.test',
        timeout: expect.any(Number),
        params: expect.objectContaining({ key: 'tok' }),
        agentOptions: expect.objectContaining({ maxSockets: expect.any(Number) }),
      }),
    )
  })

  it('searchRaw hits /search with the free-text query and forwards the abort signal', async () => {
    mockGet.mockResolvedValue({ data: [{ lat: '-23.5', lon: '-46.6', class: 'place', type: 'city', place_rank: 30 }] })
    const signal = new AbortController().signal

    await build().searchRaw('Av Paulista', signal)

    expect(mockGet).toHaveBeenCalledWith('/search', {
      params: expect.objectContaining({ q: 'Av Paulista' }),
      signal,
    })
  })

  it('searchRaw maps the first result, parsing coordinates and precision', async () => {
    mockGet.mockResolvedValue({
      data: [
        { lat: '-23.55052', lon: '-46.633308', class: 'building', type: 'house', place_rank: 30 },
        { lat: '1', lon: '2', class: 'place', type: 'city' },
      ],
    })

    const result = await build().searchRaw('Av Paulista')

    expect(result).toEqual({
      lat: -23.55052,
      lon: -46.633308,
      precision: EnumGeoPrecision.ROOFTOP,
      providerName: 'LocationIQ',
    })
  })

  it('returns null when the API responds with an empty array', async () => {
    mockGet.mockResolvedValue({ data: [] })
    expect(await build().searchRaw('nowhere')).toBeNull()
  })

  it('returns null when the API response has no data field', async () => {
    mockGet.mockResolvedValue({})
    expect(await build().searchRaw('nowhere')).toBeNull()
  })

  it('searchStructuredRaw forwards the structured address components', async () => {
    mockGet.mockResolvedValue({ data: [{ lat: '0', lon: '0', class: '', type: '' }] })

    await build().searchStructuredRaw({
      street: 'Av Paulista',
      city: 'São Paulo',
      state: 'SP',
      country: 'BR',
    })

    expect(mockGet).toHaveBeenCalledWith('/search', {
      params: expect.objectContaining({
        street: 'Av Paulista',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR',
      }),
      signal: undefined,
    })
  })
})
