import { z } from 'zod'
import { passwordSchema } from '@schemas/utils/password'

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  token: z.string(),
})
