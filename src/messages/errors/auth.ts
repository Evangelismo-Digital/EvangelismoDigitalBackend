import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const AUTH_ERRORS = {
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Não autorizado!',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Acesso negado!',
  },
  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    message: 'Credenciais inválidas!',
  },
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Token inválido ou expirado!',
  },
  PASSWORD_CHANGE_REQUIRED: {
    code: 'PASSWORD_CHANGE_REQUIRED',
    message: 'É necessário alterar a senha antes de acessar o sistema!',
  },
} as const satisfies Record<string, IErrorDetail>
