import { z } from 'zod'
import { cpf } from 'cpf-cnpj-validator'
import { VALIDATION_CONSTANTS } from 'messages/constants/validation/validation'

export const cpfSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(/\D/g, '') : val),
  z
    .string()
    .length(11, { message: VALIDATION_CONSTANTS.CPF.INVALID })
    .refine(cpf.isValid, { message: VALIDATION_CONSTANTS.CPF.INVALID })
    .transform(cpf.format),
)
