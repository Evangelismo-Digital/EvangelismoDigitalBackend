import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const INVALID_PASSWORD_RESET_PAYLOAD_ERROR_FN = (fieldName?: string): IErrorDetail => ({
  code: 'INVALID_PASSWORD_RESET_PAYLOAD',
  message: fieldName
    ? `Payload de reset de senha inválido: campo '${fieldName}' possui valor inesperado.`
    : 'Payload de reset de senha inválido: um ou mais campos possuem valores inesperados.',
})
