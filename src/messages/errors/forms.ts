import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const FORM_ERRORS = {
  SUBMISSION: {
    code: 'FORM_SUBMISSION_ERROR',
    message: 'Ocorreu um erro ao submeter o formulário.',
  },
  ALREADY_EXISTS: {
    code: 'FORM_ALREADY_EXISTS',
    message: 'Já existe um formulário submetido com este email.',
  },
  NOT_FOUND: {
    code: 'FORM_NOT_FOUND',
    message: 'Nenhum formulário encontrado para o email fornecido.',
  },
} as const satisfies Record<string, IErrorDetail>

export const INVALID_FORM_PAYLOAD_ERROR_FN = (fieldName?: string): IErrorDetail => ({
  code: 'INVALID_FORM_PAYLOAD',
  message: fieldName
    ? `Payload do formulário inválido: campo '${fieldName}' possui valor inesperado.`
    : 'Payload do formulário inválido: um ou mais campos possuem valores inesperados.',
})
