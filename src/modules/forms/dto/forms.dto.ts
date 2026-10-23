import { z } from 'zod'
import { emailSchema } from '@common/utils/email'
import { VALIDATION_LIMITS } from '@common/constants/validation-limits'

export const formsSchema = z.object({
  name: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  lastName: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  email: emailSchema,
  decisaoPorCristo: z.boolean(),
  location: z.string().optional(),
})
