export const EMAIL_CONSTANTS = {
  PASSWORD_RECOVERY_SUBJECT: 'Recuperação de senha',
  PASSWORD_RESET_GENERIC_MESSAGE:
    'Se o usuário existir, você receberá um e-mail com instruções para redefinir a senha.',
} as const

export const EMAIL_LOGS = {
  SMTP_VERIFIED: 'transportador SMTP verificado com sucesso',
  SMTP_VERIFY_FAILED: 'transportador SMTP falhou na verificação',
  SMTP_CIRCUIT_OPENED:
    'Circuito do SMTP aberto após falhas consecutivas; envios falharão rápido e o transportador será recriado.',
} as const
