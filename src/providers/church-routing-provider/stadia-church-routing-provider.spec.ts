import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StadiaChurchRoutingProvider } from './stadia-church-routing-provider'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

const mockedAxiosPost = vi.mocked(axios.post)

describe('StadiaChurchRoutingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the configured default costing when no profile is provided', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: {
        status: 0,
        routes: [{ summary: { length: 2.5 } }],
      },
    })

    const provider = new StadiaChurchRoutingProvider({
      apiUrl: 'https://api.stadiamaps.com/route/v1/',
      apiToken: 'test-token',
      defaultCosting: 'pedestrian',
    })

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
    })

    expect(result).toEqual([{ distance: 2.5, status: 0 }])
    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://api.stadiamaps.com/route/v1',
      expect.objectContaining({
        costing: 'pedestrian',
        directions_options: { units: 'kilometers' },
      }),
      expect.objectContaining({
        headers: {
          Authorization: 'Stadia-Auth test-token',
          'Content-Type': 'application/json',
        },
      }),
    )
  })

  it('uses an explicit profile over the default costing', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: {
        status: 0,
        distance: 1.2,
      },
    })

    const provider = new StadiaChurchRoutingProvider({
      apiUrl: 'https://api.stadiamaps.com/route/v1',
      apiToken: 'test-token',
      defaultCosting: 'auto',
    })

    await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      profile: 'pedestrian',
    })

    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://api.stadiamaps.com/route/v1',
      expect.objectContaining({ costing: 'pedestrian' }),
      expect.any(Object),
    )
  })
})