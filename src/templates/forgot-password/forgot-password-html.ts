import { env } from '@env/index'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'

export function forgotPasswordHtmlTemplate(userName: string, token: string) {
  const url = `${env.FRONTEND_URL}/reset-password/${token}`
  const appName = env.APP_NAME
  return `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <h2>Olá, ${userName}!</h2>
      <p>
        Recebemos uma solicitação para redefinir a sua senha.<br>
        Para continuar, clique no botão abaixo:
      </p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${url}" style="background: #1976d2; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Redefinir senha
        </a>
      </p>
      <p>
        Ou copie e cole este link no seu navegador:<br>
        <a href="${url}">${url}</a>
      </p>
      <p>
        Este link é válido por ${PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES} minutos.
      </p>
      <p>
        Se você não solicitou a recuperação de senha, ignore este e-mail.
      </p>
      <p>
        Atenciosamente,<br>
        Equipe ${appName}
      </p>
    </div>
  `
}
