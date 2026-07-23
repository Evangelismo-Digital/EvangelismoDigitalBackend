import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const USER_ERRORS = {
  NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: 'Usuário não encontrado.',
  },
  ALREADY_EXISTS: {
    code: 'USER_ALREADY_EXISTS',
    message: 'Usuário já existe !',
  },
  NOT_CREATED: {
    code: 'USER_NOT_CREATED',
    message: 'Falha ao criar o usuário.',
  },
  NOT_FOUND_FOR_PASSWORD_RESET: {
    code: 'USER_NOT_FOUND_FOR_PASSWORD_RESET',
    message: 'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
  },
} as const satisfies Record<string, IErrorDetail>
