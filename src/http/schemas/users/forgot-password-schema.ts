import { z } from 'zod'
import { emailSchema } from '../utils/email'

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})
