export const PASSWORD_RESET_CONSTANTS = {
  /** Janela de validade do token — também impressa nos templates de e-mail. */
  TOKEN_EXPIRES_IN_MINUTES: 15,
  /** Bytes de entropia do token (64 hex chars). */
  TOKEN_LENGTH_BYTES: 32,
  /**
   * Orçamento de retry do job de e-mail: 3 tentativas × backoff fixo de 30s
   * (~1 min no pior caso) cabe com folga na janela de 15 min do token.
   */
  JOB_ATTEMPTS: 3,
  JOB_BACKOFF_DELAY_MS: 30_000,
} as const
