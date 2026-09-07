import z from 'zod'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const findChurchByNameSchema = z.object({
  name: z
    .string()
    .min(
      VALIDATION_LIMITS.CHURCH_NAME_MIN,
      `O nome deve ter no mínimo ${VALIDATION_LIMITS.CHURCH_NAME_MIN} caracteres`,
    ),
})

export type findChurchByNameSchema = z.infer<typeof findChurchByNameSchema>
