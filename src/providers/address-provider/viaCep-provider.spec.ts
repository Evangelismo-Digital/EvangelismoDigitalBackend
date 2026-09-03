import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ get: mockGet })),
}))

import { ViaCepProvider } from './viaCep-provider'
import { createHttpClient } from '@lib/http/axios'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

function build() {
  return new ViaCepProvider({ apiUrl: 'https://viacep.test' })
}

const response = {
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  complemento: 'de 612 a 1510 - lado par',
  bairro: 'Bela Vista',
  localidade: 'São Paulo',
  uf: 'SP',
  ibge: '3550308',
  gia: '1004',
  ddd: '11',
  siafi: '7107',
}

describe('ViaCepProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes provider identity and rate-limit metadata', () => {
    const provider = build()
    expect(provider.providerName).toBe('ViaCEP')
    expect(provider.rateLimitConfig).toBe('viacepAddressProvider')
  })

  it('wires the HTTP client with the base URL, a User-Agent header, a timeout and agent options', () => {
    build()

    expect(vi.mocked(createHttpClient)).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://viacep.test',
        timeout: expect.any(Number),
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
        agentOptions: expect.objectContaining({ maxSockets: expect.any(Number) }),
      }),
    )
  })

  it('builds the /{cep}/json URL from digits only and forwards the signal', async () => {
    mockGet.mockResolvedValue({ data: response })
    const signal = new AbortController().signal

    await build().fetchRawAddress('01310-100', signal)

    expect(mockGet).toHaveBeenCalledWith('/01310100/json', { signal })
  })

  it('normalizes a successful response', async () => {
    mockGet.mockResolvedValue({ data: response })

    const result = await build().fetchRawAddress('01310100')

    expect(result).toEqual({
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
      precision: EnumGeoPrecision.ROOFTOP,
      providerName: 'ViaCEP',
    })
  })

  it('returns NEIGHBORHOOD precision when only the bairro is present', async () => {
    mockGet.mockResolvedValue({ data: { ...response, logradouro: '' } })

    const result = await build().fetchRawAddress('01310100')

    expect(result?.precision).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('returns null when ViaCEP flags the CEP as not found (erro: true)', async () => {
    mockGet.mockResolvedValue({ data: { erro: true } })
    expect(await build().fetchRawAddress('00000000')).toBeNull()
  })

  it('returns null when there is no payload at all', async () => {
    mockGet.mockResolvedValue({ data: undefined })
    expect(await build().fetchRawAddress('00000000')).toBeNull()
  })
})
