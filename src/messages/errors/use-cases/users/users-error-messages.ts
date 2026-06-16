import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { messages } from 'core/constants/messages'

export const USER_NOT_FOUND_ERROR: IErrorDetail = {
  code: 'USER_NOT_FOUND',
  message: 'Usuário não encontrado.',
}

export const USER_ALREADY_EXISTS_ERROR: IErrorDetail = {
  code: 'USER_ALREADY_EXISTS',
  message: messages.validation.userAlreadyExists,
}

export const USER_NOT_CREATED_ERROR: IErrorDetail = {
  code: 'USER_NOT_CREATED',
  message: messages.errors.createUserFailed,
}

export const USER_NOT_FOUND_FOR_PASSWORD_RESET_ERROR: IErrorDetail = {
  code: 'USER_NOT_FOUND_FOR_PASSWORD_RESET',
  message: messages.info.passwordResetGeneric,
}

export const INVALID_CREDENTIALS_ERROR: IErrorDetail = {
  code: 'INVALID_CREDENTIALS',
  message: messages.errors.invalidCredentials,
}

export const INVALID_TOKEN_ERROR: IErrorDetail = {
  code: 'INVALID_TOKEN',
  message: messages.errors.invalidToken,
}
