import { describe, it, expect, vi } from 'vitest'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances.service'
import { IChurchRoutingProvider } from '@infra/providers/interfaces/church-routing-provider.interface'
import { NearbyChurch } from '@modules/churches/repositories/churches-repository.interface'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { ok, err, isOk, isErr } from '@common/utils/result'
import { NoNearbyChurchesFoundError } from '@modules/churches/errors/no-nearby-churches-found-error'
import { ProviderFailureError } from '@common/errors/infrastructure/provider-failure-error'

/**
 * Regression: **a far CEP searched on foot answered 503 instead of "no church
 * nearby".**
 *
 * The KNN step returns the geometrically nearest churches however far they are.
 * For a São Paulo CEP (01310-100) those are ~326 km away, and Geoapify refuses a
 * walking matrix over 100 km (`400 Too long distance…`). That 400 maps to the
 * RETRYABLE `ProviderFailureError`, the chain ran out of providers, and the user
 * got `503 SERVICE_UNAVAILABLE`: the page said "check your connection" and
 * offered a retry that could never succeed, instead of the walking → car
 * fallback that `NO_NEARBY_CHURCHES_FOUND` triggers. The same path made the fake
 * CEP 99999999 (geolocated by BrasilAPI to Sarandi/PR) answer 503. Found by the
 * frontend's real-backend suite. Defect: far CEP on foot → 503 (2026-10-25).
 *
 * The fix drops candidates whose straight-line distance already exceeds the
 * mode's ceiling before routing: a route is never shorter than the straight
 * line, so nothing the ceiling would have kept is lost.
 */

const user = { userLat: -23.5613, userLon: -46.6565 }

function church(id: number, straightLineKm: number): NearbyChurch {
  return {
    id,
    publicId: `church-${id}`,
    name: `Igreja ${id}`,
    address: `Rua ${id}`,
    lat: -22.9,
    lon: -43.1,
    distanceKm: straightLineKm,
    distanceMeters: straightLineKm * 1000,
  }
}

/** What Geoapify did for a >100 km walking matrix: a 400, mapped RETRYABLE. */
function providerRefusingLongWalks(): IChurchRoutingProvider {
  return { getDistances: vi.fn().mockResolvedValue(err(new ProviderFailureError())) }
}

function providerReturning(distances: number[]): IChurchRoutingProvider {
  return { getDistances: vi.fn().mockResolvedValue(ok(distances.map((distance) => ({ distance, status: 0 })))) }
}

describe('Regression: a far CEP searched on foot answered 503', () => {
  it('answers NO_NEARBY_CHURCHES_FOUND without routing when every church is beyond walking reach', async () => {
    const routing = providerRefusingLongWalks()

    const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
      { churches: [church(1, 326), church(2, 331)], user },
      RoutingProfile.PEDESTRIAN,
    )

    expect(isErr(result) && result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    expect(routing.getDistances).not.toHaveBeenCalled()
  })

  it('routes only the candidates within reach when the list is mixed', async () => {
    const routing = providerReturning([1.8])

    const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
      { churches: [church(1, 1.2), church(2, 326)], user },
      RoutingProfile.PEDESTRIAN,
    )

    expect(vi.mocked(routing.getDistances).mock.calls[0][0].destinations).toHaveLength(1)
    expect(isOk(result) && result.value.map((c) => [c.id, c.distanceKm])).toEqual([[1, 1.8]])
  })

  describe('counterweight: the pre-filter must not drop what the ceiling would keep', () => {
    it('still routes a church exactly at the walking ceiling as the crow flies', async () => {
      const routing = providerReturning([10])

      const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
        { churches: [church(1, 10)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(routing.getDistances).toHaveBeenCalledTimes(1)
      expect(isOk(result) && result.value.map((c) => c.id)).toEqual([1])
    })

    it('still routes a church just inside walking reach', async () => {
      const routing = providerReturning([9.9])

      const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
        { churches: [church(1, 9.5)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isOk(result) && result.value.map((c) => c.id)).toEqual([1])
    })

    it('filters by the transport ceiling, not the walking one, when travelling by vehicle', async () => {
      const routing = providerReturning([140])

      const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
        { churches: [church(1, 120)], user },
        RoutingProfile.TRANSPORT,
      )

      expect(routing.getDistances).toHaveBeenCalledTimes(1)
      expect(isOk(result) && result.value.map((c) => c.distanceKm)).toEqual([140])
    })

    it('still surfaces a genuine provider outage as a failure, not as "no church nearby"', async () => {
      const routing = providerRefusingLongWalks()

      const result = await new CalculateChurchRouteDistancesUseCase(routing).findNearest(
        { churches: [church(1, 2)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isErr(result) && result.error).toBeInstanceOf(ProviderFailureError)
    })
  })
})
