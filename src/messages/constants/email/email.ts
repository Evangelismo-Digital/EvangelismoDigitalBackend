export const EMAIL_CONSTANTS = {
  PASSWORD_RECOVERY_SUBJECT: 'Recuperação de senha',
  PASSWORD_RESET_GENERIC_MESSAGE:
    'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
  // Após N falhas consecutivas de envio, o transportador em cache é descartado e recriado (SMTP instável)
  SMTP_MAX_CONSECUTIVE_FAILURES: 3,
} as const
