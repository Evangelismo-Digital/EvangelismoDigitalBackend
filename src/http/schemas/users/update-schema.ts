import { z } from 'zod'
import { emailSchema } from 'core/validation/email'
import { usernameSchema } from '../utils/username'

export const updateSchema = z.object({
  name: z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
})
