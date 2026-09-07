import z from 'zod'
import { MAX_LATITUDE, MAX_LONGITUDE, MIN_LATITUDE, MIN_LONGITUDE } from 'core/constants/geo'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const createChurchBodySchema = z.object({
  name: z
    .string()
    .min(VALIDATION_LIMITS.CHURCH_NAME_MIN, `O nome deve ter no mínimo ${VALIDATION_LIMITS.CHURCH_NAME_MIN} caracteres`)
    .transform((val) => val.toLowerCase()),
  address: z
    .string()
    .min(
      VALIDATION_LIMITS.CHURCH_ADDRESS_MIN,
      `O endereço deve ter no mínimo ${VALIDATION_LIMITS.CHURCH_ADDRESS_MIN} caracteres`,
    )
    .transform((val) => val.toLowerCase()),
  lat: z.coerce
    .number()
    .min(MIN_LATITUDE, `Latitude deve ser >= ${MIN_LATITUDE}`)
    .max(MAX_LATITUDE, `Latitude deve ser <= ${MAX_LATITUDE}`),
  lon: z.coerce
    .number()
    .min(MIN_LONGITUDE, `Longitude deve ser >= ${MIN_LONGITUDE}`)
    .max(MAX_LONGITUDE, `Longitude deve ser <= ${MAX_LONGITUDE}`),
})

export type createChurchBodySchema = z.infer<typeof createChurchBodySchema>
