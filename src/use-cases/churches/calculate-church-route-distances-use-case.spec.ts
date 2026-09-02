import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'

function church(overrides: Partial<NearbyChurch> = {}): NearbyChurch {
  return {
    id: 1,
    publicId: 'pub-1',
    name: 'Church 1',
    address: 'Rua 1',
    lat: -23.5,
    lon: -46.6,
    distanceKm: 0,
    distanceMeters: 0,
    ...overrides,
  }
}

describe('CalculateChurchRouteDistancesUseCase', () => {
  let routingProvider: IChurchRoutingProvider
  let useCase: CalculateChurchRouteDistancesUseCase

  const user = { userLat: -23.55, userLon: -46.63 }

  beforeEach(() => {
    routingProvider = { getDistances: vi.fn() }
    useCase = new CalculateChurchRouteDistancesUseCase(routingProvider)
  })

  it('returns EmptyChurchListError when the church list is empty', async () => {
    const result = await useCase.findNearest({ churches: [], user })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(EmptyChurchListError)
    expect(routingProvider.getDistances).not.toHaveBeenCalled()
  })

  it('forwards origin, destinations, profile and signal to the routing provider', async () => {
    const churches = [church({ id: 1, lat: 1, lon: 2 }), church({ id: 2, lat: 3, lon: 4 })]
    const signal = new AbortController().signal
    vi.mocked(routingProvider.getDistances).mockResolvedValue(ok([{ distance: 5 }, { distance: 10 }]))

    await useCase.findNearest({ churches, user, signal }, RoutingProfile.PEDESTRIAN)

    expect(routingProvider.getDistances).toHaveBeenCalledWith({
      origin: { lat: user.userLat, lon: user.userLon },
      destinations: [
        { lat: 1, lon: 2 },
        { lat: 3, lon: 4 },
      ],
      profile: RoutingProfile.PEDESTRIAN,
      signal,
    })
  })

  it('propagates a failure Result from the routing provider unchanged', async () => {
    const failure = err(new ServiceBusyError('Stadia'))
    vi.mocked(routingProvider.getDistances).mockResolvedValue(failure)

    const result = await useCase.findNearest({ churches: [church()], user })

    expect(result).toBe(failure)
  })

  it('ranks reachable churches ascending by distanceKm and derives distanceMeters', async () => {
    const churches = [
      church({ id: 1, publicId: 'a' }),
      church({ id: 2, publicId: 'b' }),
      church({ id: 3, publicId: 'c' }),
    ]
    vi.mocked(routingProvider.getDistances).mockResolvedValue(ok([{ distance: 8 }, { distance: 2 }, { distance: 5 }]))

    const result = await useCase.findNearest({ churches, user })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.map((c) => c.publicId)).toEqual(['b', 'c', 'a'])
      expect(result.value.map((c) => c.distanceKm)).toEqual([2, 5, 8])
      expect(result.value.map((c) => c.distanceMeters)).toEqual([2000, 5000, 8000])
    }
  })

  it('drops entries with null distance, missing result, or non-zero status', async () => {
    const churches = [
      church({ id: 1, publicId: 'keep' }),
      church({ id: 2, publicId: 'null-distance' }),
      church({ id: 3, publicId: 'bad-status' }),
      church({ id: 4, publicId: 'missing' }),
    ]
    const results = [
      { distance: 3, status: 0 },
      { distance: null },
      { distance: 9, status: 1 },
      null,
    ] as unknown as RouteDistanceResult[]
    vi.mocked(routingProvider.getDistances).mockResolvedValue(ok(results))

    const result = await useCase.findNearest({ churches, user })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toHaveLength(1)
      expect(result.value[0].publicId).toBe('keep')
    }
  })

  it('keeps entries whose status is explicitly 0', async () => {
    vi.mocked(routingProvider.getDistances).mockResolvedValue(ok([{ distance: 4, status: 0 }]))

    const result = await useCase.findNearest({ churches: [church()], user })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toHaveLength(1)
  })

  it('returns NoNearbyChurchesFoundError when every route is unreachable', async () => {
    vi.mocked(routingProvider.getDistances).mockResolvedValue(ok([{ distance: null }, { distance: 1, status: 2 }]))

    const result = await useCase.findNearest({ churches: [church({ id: 1 }), church({ id: 2 })], user })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
  })
})
