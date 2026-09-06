import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **a church hundreds of kilometres away was presented as "nearest".**
 *
 * The KNN step has no distance cut-off — it returns the geometrically nearest
 * candidates however far away they are — and nothing downstream applied one
 * either. `FindNearbyParams.maxRadiusMeters` looked like the guard, but it was
 * honoured only by the in-memory double and silently ignored by the Prisma
 * query, so a unit test asserting a 50km filter passed against a fiction.
 *
 * For a user in a sparse region the result depended on whether Stadia happened
 * to be able to route that far: unroutable meant "no churches found", routable
 * meant being handed a 200km *walking* route as the nearest church.
 *
 * The cut is now made on the routed distance a person would actually travel,
 * with a ceiling per routing profile. Defect D19 in
 * docs/timeout-and-cancellation-model.md.
 */

import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import { IChurchRoutingProvider } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ROUTING_MAX_DISTANCE_KM } from 'messages/constants/churches/churches'
import { ok, isOk, isErr } from 'core/shared/result'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'

const user = { userLat: -23.5505, userLon: -46.6333 }

function church(id: number): NearbyChurch {
  return {
    id,
    publicId: `church-${id}`,
    name: `Igreja ${id}`,
    address: `Rua ${id}`,
    lat: -23.55,
    lon: -46.63,
    distanceKm: 0,
    distanceMeters: 0,
  }
}

/** A routing provider that reports the given routed distances, in kilometres. */
function routingReturning(...distances: number[]): IChurchRoutingProvider {
  return {
    getDistances: vi.fn().mockResolvedValue(ok(distances.map((distance) => ({ distance, status: 0 })))),
  }
}

describe('regression: a church beyond a plausible journey must not be "nearest"', () => {
  let useCase: CalculateChurchRouteDistancesUseCase

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drops a 200km walk instead of presenting it as the nearest church', async () => {
    useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(200))

    const result = await useCase.findNearest({ churches: [church(1)], user }, RoutingProfile.PEDESTRIAN)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    }
  })

  it('keeps the reachable churches and drops only the distant ones', async () => {
    useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(2, 250, 5))

    const result = await useCase.findNearest(
      { churches: [church(1), church(2), church(3)], user },
      RoutingProfile.PEDESTRIAN,
    )

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.map((c) => c.id)).toEqual([1, 3])
    }
  })

  it('does not depend on whether the routing provider could route that far', async () => {
    // The old behaviour was decided by Stadia's routability, which made the
    // boundary arbitrary: the same distance could be kept or dropped.
    useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(120))

    const result = await useCase.findNearest({ churches: [church(1)], user }, RoutingProfile.PEDESTRIAN)

    expect(isErr(result)).toBe(true)
  })

  describe('the ceiling follows the routing profile', () => {
    it('allows by car what it refuses on foot', async () => {
      const distance = 80

      const onFoot = await new CalculateChurchRouteDistancesUseCase(routingReturning(distance)).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )
      const byCar = await new CalculateChurchRouteDistancesUseCase(routingReturning(distance)).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.AUTO,
      )

      expect(isErr(onFoot)).toBe(true)
      expect(isOk(byCar)).toBe(true)
    })

    it('falls back to the strictest ceiling when no profile is given', async () => {
      // An unspecified profile must never widen the cut-off by accident.
      const beyondWalking = ROUTING_MAX_DISTANCE_KM[RoutingProfile.PEDESTRIAN] + 1
      useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(beyondWalking))

      const result = await useCase.findNearest({ churches: [church(1)], user })

      expect(isErr(result)).toBe(true)
    })
  })

  describe('counterweight — the cap must not swallow ordinary results', () => {
    it('keeps a church exactly at the ceiling', async () => {
      const atLimit = ROUTING_MAX_DISTANCE_KM[RoutingProfile.PEDESTRIAN]
      useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(atLimit))

      const result = await useCase.findNearest({ churches: [church(1)], user }, RoutingProfile.PEDESTRIAN)

      expect(isOk(result)).toBe(true)
    })

    it('keeps a normal short walk and still orders nearest first', async () => {
      useCase = new CalculateChurchRouteDistancesUseCase(routingReturning(3.2, 0.8))

      const result = await useCase.findNearest({ churches: [church(1), church(2)], user }, RoutingProfile.PEDESTRIAN)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.map((c) => c.distanceKm)).toEqual([0.8, 3.2])
      }
    })
  })
})
