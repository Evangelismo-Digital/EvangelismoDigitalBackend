import { env } from '@env/index'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'

export function forgotPasswordTextTemplate(userName: string, token: string) {
  const url = `${env.FRONTEND_URL}/reset-password/${token}`
  const appName = env.APP_NAME
  return `
Olá, ${userName}!

Recebemos uma solicitação para redefinir a sua senha. Para continuar, acesse o link abaixo:

${url}

Este link é válido por ${PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES} minutos.

Se você não solicitou a recuperação de senha, ignore este e-mail.

Atenciosamente,
Equipe ${appName}
  `.trim()
}
