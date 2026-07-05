import { z } from 'zod'
import { cpf } from 'cpf-cnpj-validator'
import { messages } from 'messages/constants/messages'

export const cpfSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.replace(/\D/g, '') : val),
  z
    .string()
    .length(11, { message: messages.validation.invalidCpf })
    .refine(cpf.isValid, { message: messages.validation.invalidCpf })
    .transform(cpf.format),
)
