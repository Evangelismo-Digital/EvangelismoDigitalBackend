import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const INVALID_FORM_PAYLOAD_ERROR = (fieldName?: string): IErrorDetail => ({
  code: 'INVALID_FORM_PAYLOAD',
  message: fieldName
    ? `Payload do formulário inválido: campo '${fieldName}' possui valor inesperado.`
    : 'Payload do formulário inválido: um ou mais campos possuem valores inesperados.',
})
