import { z } from 'zod'
import { emailSchema } from '../utils/email'
import { usernameSchema } from '../utils/username'

export const authenticateSchema = z.object({
  login: z.union([usernameSchema, emailSchema]),
  password: z.string().trim().min(4),
})
