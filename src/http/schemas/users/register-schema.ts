import { z } from 'zod'
import { cpfSchema } from '@schemas/utils/cpf'
import { emailSchema } from '@schemas/utils/email'
import { usernameSchema } from '@schemas/utils/username'
import { passwordSchema } from '@schemas/utils/password'

export const registerSchema = z.object({
  name: z.string().trim().min(4).max(255),
  username: usernameSchema,
  email: emailSchema,
  cpf: cpfSchema,
  password: passwordSchema,
})
