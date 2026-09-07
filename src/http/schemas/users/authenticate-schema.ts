import { z } from 'zod'
import { emailSchema } from 'core/validation/email'
import { usernameSchema } from '../utils/username'

export const authenticateSchema = z.object({
  login: z.union([usernameSchema, emailSchema]),
  password: z.string().trim().min(4),
})
