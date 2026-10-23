import { z } from 'zod'
import { cpfSchema } from '@common/dto/utils/cpf.dto'
import { emailSchema } from '@common/utils/email'
import { usernameSchema } from '@common/dto/utils/username.dto'
import { passwordSchema } from '@common/dto/utils/password.dto'
import { VALIDATION_LIMITS } from '@common/constants/validation-limits'

export const registerSchema = z.object({
  name: z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  username: usernameSchema,
  email: emailSchema,
  cpf: cpfSchema,
  password: passwordSchema,
})
