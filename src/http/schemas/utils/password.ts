import { z } from 'zod'
import {
  PASSWORD_TOO_SHORT_MESSAGE,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_UPPERCASE_MESSAGE,
  PASSWORD_LOWERCASE_MESSAGE,
  PASSWORD_DIGIT_MESSAGE,
  PASSWORD_SPECIAL_MESSAGE,
  PASSWORD_NO_SPACES_MESSAGE,
} from 'messages/constants/validation/password'

export const passwordSchema = z
  .string()
  .trim()
  .min(8, { message: PASSWORD_TOO_SHORT_MESSAGE })
  .max(64, { message: PASSWORD_TOO_LONG_MESSAGE })
  .regex(/[A-Z]/, { message: PASSWORD_UPPERCASE_MESSAGE })
  .regex(/[a-z]/, { message: PASSWORD_LOWERCASE_MESSAGE })
  .regex(/[0-9]/, { message: PASSWORD_DIGIT_MESSAGE })
  .regex(/[\W_]/, { message: PASSWORD_SPECIAL_MESSAGE })
  .refine((val) => !val.includes(' '), { message: PASSWORD_NO_SPACES_MESSAGE })

export type PasswordSchemaType = z.infer<typeof passwordSchema>
