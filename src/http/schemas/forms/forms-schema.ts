import { z } from 'zod'
import { emailSchema } from 'core/validation/email'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const formsSchema = z.object({
  name: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  lastName: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  email: emailSchema,
  decisaoPorCristo: z.boolean(),
  location: z.string().optional(),
})
