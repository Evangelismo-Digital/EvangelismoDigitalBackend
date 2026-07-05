import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const USER_NOT_FOUND_ERROR: IErrorDetail = {
  code: 'USER_NOT_FOUND',
  message: 'Usuário não encontrado.',
}

export const USER_ALREADY_EXISTS_ERROR: IErrorDetail = {
  code: 'USER_ALREADY_EXISTS',
  message: 'Usuário já existe !',
}

export const USER_NOT_CREATED_ERROR: IErrorDetail = {
  code: 'USER_NOT_CREATED',
  message: 'Falha ao criar o usuário.',
}

export const USER_NOT_FOUND_FOR_PASSWORD_RESET_ERROR: IErrorDetail = {
  code: 'USER_NOT_FOUND_FOR_PASSWORD_RESET',
  message: 'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
}

export const INVALID_CREDENTIALS_ERROR: IErrorDetail = {
  code: 'INVALID_CREDENTIALS',
  message: 'Credenciais inválidas!',
}

export const INVALID_TOKEN_ERROR: IErrorDetail = {
  code: 'INVALID_TOKEN',
  message: 'Token inválido ou expirado!',
}

export const FAILED_TO_SEND_EMAIL_ERROR: IErrorDetail = {
  code: 'FAILED_TO_SEND_EMAIL',
  message: 'Não foi possível enviar o e-mail. Por favor, tente novamente.',
}

export const FORBIDDEN_ERROR: IErrorDetail = {
  code: 'FORBIDDEN',
  message: 'Acesso negado!',
}

export const UNAUTHORIZED_ERROR: IErrorDetail = {
  code: 'UNAUTHORIZED',
  message: 'Não autorizado!',
}
