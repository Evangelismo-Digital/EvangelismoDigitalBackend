import { z } from 'zod'
import { cpf } from 'cpf-cnpj-validator'
import { VALIDATION_CONSTANTS } from 'messages/constants/validation/validation'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const cpfSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(/\D/g, '') : val),
  z
    .string()
    .length(VALIDATION_LIMITS.CPF_DIGITS, { message: VALIDATION_CONSTANTS.CPF.INVALID })
    .refine(cpf.isValid, { message: VALIDATION_CONSTANTS.CPF.INVALID })
    .transform(cpf.format),
)
