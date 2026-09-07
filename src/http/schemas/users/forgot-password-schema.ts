import { z } from 'zod'
import { emailSchema } from 'core/validation/email'

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})
