import { FormPayload } from 'core/types/use-cases/forms/form-payload'

export const OUTBOX_EVENT_TYPES = {
  FORM_SUBMISSION_CREATED: 'FormSubmissionCreated',
  // The name of an outbox EVENT TYPE, not a credential — the heuristic pairs
  // the word "password" with a string literal on the same line. The real reset
  // token lives only in the transient payload below.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_RESET_REQUESTED: 'PasswordResetRequested',
} as const

export type PasswordResetRequestedPayload = {
  userPublicId: string
  name: string
  email: string
  /** Token cru — vive apenas neste payload transitório (deletado no envio/expiração) e no e-mail. */
  token: string
  /** ISO string (o payload é serializado como JSON). */
  tokenExpiresAt: string
}

/**
 * União discriminada por `type`: o compilador garante o formato do payload
 * de cada tipo de evento e obriga eventos expiráveis a declararem `expiresAt`.
 */
export type OutboxEventInput =
  | {
      type: typeof OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED
      payload: FormPayload
      expiresAt?: undefined
    }
  | {
      type: typeof OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED
      payload: PasswordResetRequestedPayload
      /** = tokenExpiresAt — após este instante o evento é deletado, nunca despachado. */
      expiresAt: Date
    }
