import { z } from 'zod'
import { emailSchema } from '@common/utils/email'
import { usernameSchema } from '@common/dto/utils/username.dto'

export const updateSchema = z.object({
  name: z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
})
