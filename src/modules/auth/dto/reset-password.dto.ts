import { z } from 'zod'
import { passwordSchema } from '@common/dto/utils/password.dto'

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  token: z.string(),
})
