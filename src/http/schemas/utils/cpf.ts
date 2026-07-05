import { z } from 'zod'
import { cpf } from 'cpf-cnpj-validator'
import { INVALID_CPF_MESSAGE } from 'messages/constants/validation/cpf'

export const cpfSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(/\D/g, '') : val),
  z
    .string()
    .length(11, { message: INVALID_CPF_MESSAGE })
    .refine(cpf.isValid, { message: INVALID_CPF_MESSAGE })
    .transform(cpf.format),
)
