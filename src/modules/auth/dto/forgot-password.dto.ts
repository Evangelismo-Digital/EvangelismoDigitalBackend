import { z } from 'zod'
import { emailSchema } from '@common/utils/email'

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})
