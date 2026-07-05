import { z } from 'zod'
import { messages } from 'messages/constants/messages'

export const passwordSchema = z
  .string()
  .trim()
  .min(8, { message: messages.validation.passwordTooShort })
  .max(64, { message: messages.validation.passwordTooLong })
  .regex(/[A-Z]/, { message: messages.validation.passwordUppercase })
  .regex(/[a-z]/, { message: messages.validation.passwordLowercase })
  .regex(/[0-9]/, { message: messages.validation.passwordDigit })
  .regex(/[\W_]/, { message: messages.validation.passwordSpecial })
  .refine((val) => !val.includes(' '), { message: messages.validation.passwordNoSpaces })

export type PasswordSchemaType = z.infer<typeof passwordSchema>
