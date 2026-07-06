import { z } from 'zod'
import { VALIDATION_CONSTANTS } from 'messages/constants/validation/validation'

// Brazilian CEP: 5 digits, optional hyphen, 3 digits (e.g., 12345-678 or 12345678)
export const cepSchema = z.string().regex(/^\d{5}-?\d{3}$/, {
  message: VALIDATION_CONSTANTS.CEP.INVALID_FORMAT,
})

export type CepSchemaType = z.infer<typeof cepSchema>
