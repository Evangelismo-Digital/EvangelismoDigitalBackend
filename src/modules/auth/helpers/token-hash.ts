import { createHash } from 'node:crypto'

/**
 * Armazenamos apenas o hash do token de reset em users.token; o token cru vive
 * exclusivamente no payload transitório da outbox (deletado no envio/expiração)
 * e no link do e-mail. Um vazamento do banco não expõe tokens utilizáveis.
 */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}
