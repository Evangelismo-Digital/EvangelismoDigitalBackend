import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import { IChurchRoutingProvider } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ROUTING_MAX_DISTANCE_KM } from 'messages/constants/churches/churches'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'

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

/** Routing provider reporting the given results verbatim. */
function providerReturning(results: Array<{ distance: number | null; status?: number }>): IChurchRoutingProvider {
  return { getDistances: vi.fn().mockResolvedValue(ok(results)) }
}

function useCaseWith(results: Array<{ distance: number | null; status?: number }>) {
  return new CalculateChurchRouteDistancesUseCase(providerReturning(results))
}

const WALK_LIMIT = ROUTING_MAX_DISTANCE_KM[RoutingProfile.PEDESTRIAN]

describe('routed-distance ceiling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('the boundary itself', () => {
    it('keeps a church exactly at the ceiling', async () => {
      const result = await useCaseWith([{ distance: WALK_LIMIT, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isOk(result)).toBe(true)
    })

    it('drops a church a hair beyond the ceiling', async () => {
      const result = await useCaseWith([{ distance: WALK_LIMIT + 0.001, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isErr(result)).toBe(true)
    })

    it('keeps a church a hair inside the ceiling', async () => {
      const result = await useCaseWith([{ distance: WALK_LIMIT - 0.001, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isOk(result)).toBe(true)
    })

    it('keeps a zero-distance church — the user is standing at it', async () => {
      const result = await useCaseWith([{ distance: 0, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value[0].distanceKm).toBe(0)
    })
  })

  describe('every routing profile has a ceiling', () => {
    it.each(Object.values(RoutingProfile))('%s applies a positive, finite ceiling', async (profile) => {
      const limit = ROUTING_MAX_DISTANCE_KM[profile]

      expect(limit).toBeGreaterThan(0)
      expect(Number.isFinite(limit)).toBe(true)

      const inside = await useCaseWith([{ distance: limit - 0.5, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        profile,
      )
      const outside = await useCaseWith([{ distance: limit + 0.5, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        profile,
      )

      expect(isOk(inside)).toBe(true)
      expect(isErr(outside)).toBe(true)
    })

    it('never lets a wheeled profile be stricter than walking', async () => {
      // A ceiling table that got these backwards would silently make driving
      // results worse than walking ones.
      for (const profile of Object.values(RoutingProfile)) {
        if (profile !== RoutingProfile.PEDESTRIAN) {
          expect(ROUTING_MAX_DISTANCE_KM[profile]).toBeGreaterThanOrEqual(WALK_LIMIT)
        }
      }
    })
  })

  describe('interaction with unroutable results', () => {
    it('drops an unroutable church and keeps a reachable one', async () => {
      const result = await useCaseWith([
        { distance: null, status: 0 },
        { distance: 2, status: 0 },
      ]).findNearest({ churches: [church(1), church(2)], user }, RoutingProfile.PEDESTRIAN)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.map((c) => c.id)).toEqual([2])
    })

    it('drops a church the provider flagged with a non-zero status', async () => {
      const result = await useCaseWith([
        { distance: 1, status: 404 },
        { distance: 3, status: 0 },
      ]).findNearest({ churches: [church(1), church(2)], user }, RoutingProfile.PEDESTRIAN)

      if (isOk(result)) expect(result.value.map((c) => c.id)).toEqual([2])
    })

    it('reports no nearby churches when every candidate is filtered, whatever the reason', async () => {
      const result = await useCaseWith([
        { distance: null, status: 0 },
        { distance: 500, status: 0 },
      ]).findNearest({ churches: [church(1), church(2)], user }, RoutingProfile.PEDESTRIAN)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    })
  })

  describe('ordering and payload', () => {
    it('still orders the survivors nearest first', async () => {
      const result = await useCaseWith([
        { distance: 7, status: 0 },
        { distance: 900, status: 0 },
        { distance: 1.5, status: 0 },
      ]).findNearest({ churches: [church(1), church(2), church(3)], user }, RoutingProfile.PEDESTRIAN)

      if (isOk(result)) {
        expect(result.value.map((c) => c.distanceKm)).toEqual([1.5, 7])
      }
    })

    it('reports metres alongside kilometres for every survivor', async () => {
      const result = await useCaseWith([{ distance: 2.5, status: 0 }]).findNearest(
        { churches: [church(1)], user },
        RoutingProfile.PEDESTRIAN,
      )

      if (isOk(result)) {
        expect(result.value[0].distanceKm).toBe(2.5)
        expect(result.value[0].distanceMeters).toBe(2500)
      }
    })
  })

  describe('failures that are not about distance', () => {
    it('rejects an empty candidate list before routing anything', async () => {
      const provider = providerReturning([])
      const useCase = new CalculateChurchRouteDistancesUseCase(provider)

      const result = await useCase.findNearest({ churches: [], user }, RoutingProfile.PEDESTRIAN)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(EmptyChurchListError)
      expect(provider.getDistances).not.toHaveBeenCalled()
    })

    it('surfaces a routing provider failure rather than calling it "none nearby"', async () => {
      // A provider outage must not be reported as "there are no churches",
      // which would be indistinguishable from a genuine empty result.
      const useCase = new CalculateChurchRouteDistancesUseCase({
        getDistances: vi.fn().mockResolvedValue(err(new ServiceBusyError('Stadia Maps'))),
      })

      const result = await useCase.findNearest({ churches: [church(1)], user }, RoutingProfile.PEDESTRIAN)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
    })
  })
})
