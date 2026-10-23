import { z } from 'zod'
import { emailSchema } from '@common/utils/email'
import { usernameSchema } from '@common/dto/utils/username.dto'

export const authenticateSchema = z.object({
  login: z.union([usernameSchema, emailSchema]),
  password: z.string().trim().min(4),
})
