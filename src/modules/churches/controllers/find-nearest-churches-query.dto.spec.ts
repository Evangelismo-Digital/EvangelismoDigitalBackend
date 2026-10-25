import { describe, expect, it } from 'vitest'
import { findNearestChurchesQuerySchema } from '@modules/churches/dto/find-nearest-churches.dto'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'

describe('findNearestChurchesQuerySchema', () => {
  it('defaults the routing mode to pedestrian when the client sends only the CEP', () => {
    expect(findNearestChurchesQuerySchema.parse({ cep: '24020-000' })).toEqual({
      cep: '24020-000',
      mode: RoutingProfile.PEDESTRIAN,
    })
  })

  it.each([RoutingProfile.PEDESTRIAN, RoutingProfile.TRANSPORT])('accepts the %s mode', (mode) => {
    expect(findNearestChurchesQuerySchema.parse({ cep: '24020000', mode }).mode).toBe(mode)
  })

  it.each(['bicycle', 'auto', 'PEDESTRIAN', ''])('rejects the unknown mode %j', (mode) => {
    expect(findNearestChurchesQuerySchema.safeParse({ cep: '24020000', mode }).success).toBe(false)
  })
})
