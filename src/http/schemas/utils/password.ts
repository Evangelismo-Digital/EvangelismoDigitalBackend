import { z } from 'zod'
import { VALIDATION_CONSTANTS } from 'messages/constants/validation/validation'

export const passwordSchema = z
  .string()
  .trim()
  .min(8, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_SHORT })
  .max(64, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_LONG })
  .regex(/[A-Z]/, { message: VALIDATION_CONSTANTS.PASSWORD.UPPERCASE })
  .regex(/[a-z]/, { message: VALIDATION_CONSTANTS.PASSWORD.LOWERCASE })
  .regex(/[0-9]/, { message: VALIDATION_CONSTANTS.PASSWORD.DIGIT })
  .regex(/[\W_]/, { message: VALIDATION_CONSTANTS.PASSWORD.SPECIAL })
  .refine((val) => !val.includes(' '), { message: VALIDATION_CONSTANTS.PASSWORD.NO_SPACES })

export type PasswordSchemaType = z.infer<typeof passwordSchema>
