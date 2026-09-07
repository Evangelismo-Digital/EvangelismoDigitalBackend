import { z } from 'zod'
import { cpfSchema } from '@schemas/utils/cpf'
import { emailSchema } from 'core/validation/email'
import { usernameSchema } from '@schemas/utils/username'
import { passwordSchema } from '@schemas/utils/password'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const registerSchema = z.object({
  name: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  username: usernameSchema,
  email: emailSchema,
  cpf: cpfSchema,
  password: passwordSchema,
})
