import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const EMAIL_ERRORS = {
  FAILED_TO_SEND: {
    code: 'FAILED_TO_SEND_EMAIL',
    message: 'Não foi possível enviar o e-mail. Por favor, tente novamente.',
  },
} as const satisfies Record<string, IErrorDetail>
