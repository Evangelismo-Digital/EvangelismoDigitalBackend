import { z } from 'zod'
import { emailSchema } from '@schemas/utils/email'

export const formsSchema = z.object({
  name: z.string().trim().min(4).max(255),
  lastName: z.string().trim().min(4).max(255),
  email: emailSchema,
  decisaoPorCristo: z.boolean(),
  location: z.string().optional(),
})
