import z from 'zod'
import { cepSchema } from '@common/dto/utils/cep.dto'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'

/**
 * How the user travels to the church: `pedestrian` (default) or `transport`
 * (car / vehicle). Optional, so clients that only send `cep` keep working.
 */
export const routingModeSchema = z.enum(RoutingProfile).default(RoutingProfile.PEDESTRIAN)

export const findNearestChurchesQuerySchema = z.object({
  cep: cepSchema,
  mode: routingModeSchema,
})
