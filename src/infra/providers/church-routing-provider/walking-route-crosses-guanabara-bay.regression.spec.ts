import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression: **walking routes crossed Guanabara Bay.**
 *
 * From Niterói (24020-085) the Catedral in central Rio came back at 7.15 km on
 * foot, and from Rio Centro (20031-050) Niterói churches at 7.6–9 km on foot.
 * There is no pedestrian crossing: Geoapify's walking router was taking the
 * Rio–Niterói ferry. Without it the same walk is ~116 km around the bay, which
 * the 10 km walking ceiling then correctly drops. Found by the frontend's
 * real-backend suite. Defect: walking routes cross Guanabara Bay (2026-10-25).
 *
 * The fix asks Geoapify to avoid ferries on walking matrices only; driving
 * keeps car ferries where they exist (decided with the product owner).
 */

const { mockedPost } = vi.hoisted(() => ({ mockedPost: vi.fn() }))

vi.mock('@infra/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ post: mockedPost })),
}))

vi.mock('@infra/rate-limiter/redis-rate-limiter', () => ({
  EnumProviderConfig: { GEOAPIFY_ROUTING: 'geoapifyRoutingProvider' },
}))

import { GeoapifyChurchRoutingProvider } from './geoapify-church-routing-provider'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'

const niteroiCentro = { lat: -22.8933, lon: -43.1236 }
const catedralRio = { lat: -22.90796180249929, lon: -43.181362869287575 }

function provider() {
  return new GeoapifyChurchRoutingProvider({
    matrixApiUrl: 'https://api.geoapify.com/v1/routematrix',
    apiToken: 'geoapify-test-key',
    defaultCosting: RoutingProfile.PEDESTRIAN,
  })
}

function sentBody(): Record<string, unknown> {
  return mockedPost.mock.calls[0][1] as Record<string, unknown>
}

describe('Regression: walking routes crossed Guanabara Bay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPost.mockResolvedValue({ status: 200, data: { sources_to_targets: [[{ distance: 116396 }]] } })
  })

  it('asks Geoapify to avoid ferries on a walking matrix', async () => {
    await provider().fetchRawDistances(niteroiCentro, [catedralRio], RoutingProfile.PEDESTRIAN)

    expect(sentBody().avoid).toEqual([{ type: 'ferries' }])
  })

  it('avoids ferries when walking is only the default profile', async () => {
    await provider().fetchRawDistances(niteroiCentro, [catedralRio])

    expect(sentBody().avoid).toEqual([{ type: 'ferries' }])
  })

  it('leaves driving free to use car ferries', async () => {
    // Counterweight: the avoid option must not leak into transport, which would
    // change driving routes (and pay Geoapify's avoid surcharge) for no reason.
    await provider().fetchRawDistances(niteroiCentro, [catedralRio], RoutingProfile.TRANSPORT)

    expect(sentBody()).not.toHaveProperty('avoid')
  })
})
