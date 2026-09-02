import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ get: mockGet })),
}))

import { NominatimGeoProvider } from './nominatim-provider'
import { createHttpClient } from '@lib/http/axios'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

function build() {
  return new NominatimGeoProvider({ apiUrl: 'https://nominatim.test' })
}

describe('NominatimGeoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes provider identity and rate-limit metadata', () => {
    const provider = build()
    expect(provider.providerName).toBe('Nominatim')
    expect(provider.rateLimitConfig).toBe('nominatimGeocodingProvider')
  })

  it('wires the HTTP client with the base URL, a User-Agent header, a timeout and agent options', () => {
    build()

    expect(vi.mocked(createHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://nominatim.test',
        timeout: expect.any(Number),
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
        agentOptions: expect.objectContaining({ maxSockets: expect.any(Number) }),
      }),
    )
  })

  it('searchRaw hits /search with the free-text query and format params', async () => {
    mockGet.mockResolvedValue({ data: [{ lat: '0', lon: '0' }] })

    await build().searchRaw('Av Paulista')

    const [url, config] = mockGet.mock.calls[0]
    expect(url).toBe('/search')
    expect(config.params).toMatchObject({ q: 'Av Paulista', format: 'json' })
  })

  it('searchRaw maps the first result with parsed coordinates and OSM precision', async () => {
    mockGet.mockResolvedValue({
      data: [{ lat: '-23.55', lon: '-46.63', class: 'highway', type: 'residential', place_rank: 30 }],
    })

    const result = await build().searchRaw('Av Paulista')

    expect(result).toEqual({
      lat: -23.55,
      lon: -46.63,
      precision: EnumGeoPrecision.ROOFTOP,
      providerName: 'Nominatim',
    })
  })

  it('returns null on an empty result array', async () => {
    mockGet.mockResolvedValue({ data: [] })
    expect(await build().searchRaw('nowhere')).toBeNull()
  })

  it('returns null when data is missing entirely', async () => {
    mockGet.mockResolvedValue({ data: undefined })
    expect(await build().searchRaw('nowhere')).toBeNull()
  })

  it('strips undefined, null and empty-string params before calling the API', async () => {
    mockGet.mockResolvedValue({ data: [{ lat: '0', lon: '0' }] })

    await build().searchStructuredRaw({
      street: 'Rua A',
      city: '',
      state: null as unknown as string,
      country: undefined as unknown as string,
    })

    const [, config] = mockGet.mock.calls[0]
    expect(config.params).toMatchObject({ street: 'Rua A' })
    expect(config.params).not.toHaveProperty('city') // '' stripped
    expect(config.params).not.toHaveProperty('state') // null stripped
    expect(config.params).not.toHaveProperty('country') // undefined stripped
    // non-filtered params still make it through
    expect(config.params).toHaveProperty('limit')
  })

  it('forwards the abort signal', async () => {
    mockGet.mockResolvedValue({ data: [{ lat: '0', lon: '0' }] })
    const signal = new AbortController().signal

    await build().searchRaw('x', signal)

    expect(mockGet.mock.calls[0][1].signal).toBe(signal)
  })
})
