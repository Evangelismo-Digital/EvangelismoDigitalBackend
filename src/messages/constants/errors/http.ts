import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const INTERNAL_SERVER_ERROR: IErrorDetail = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Erro interno do servidor!',
}

export const INVALID_JSON_ERROR: IErrorDetail = {
  code: 'INVALID_JSON',
  message: 'O corpo da requisição não está em formato JSON válido. Verifique a estrutura dos dados enviados.',
}

export const RESOURCE_NOT_FOUND_ERROR: IErrorDetail = {
  code: 'RESOURCE_NOT_FOUND',
  message: 'Recurso não encontrado!',
}

export const FORBIDDEN_ERROR: IErrorDetail = {
  code: 'FORBIDDEN',
  message: 'Acesso negado!',
}

export const UNAUTHORIZED_ERROR: IErrorDetail = {
  code: 'UNAUTHORIZED',
  message: 'Não autorizado!',
}

export const PASSWORD_CHANGE_REQUIRED_ERROR: IErrorDetail = {
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'É necessário alterar a senha antes de acessar o sistema!',
}
