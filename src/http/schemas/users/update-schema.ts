import { z } from 'zod'
import { emailSchema } from '@schemas/utils/email'
import { usernameSchema } from '../utils/username'

export const updateSchema = z.object({
  name: z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
})
