/**
 * Length limits enforced by the request schemas.
 *
 * They were literals scattered across six schema files, which made two
 * questions unanswerable without grepping for a bare number: "how long may a
 * name be?" and, worse, "do the register and forms schemas agree?" — they both
 * used 255, and nothing said whether that was intentional or coincidence.
 *
 * Messages stay in `messages/constants/validation`; this file holds only the
 * numbers, because the two change for different reasons — a wording fix is not
 * a contract change, and a limit change is.
 */
export const VALIDATION_LIMITS = {
  /** Matches the `varchar(255)` columns the values are stored in. */
  NAME_MIN: 4,
  NAME_MAX: 255,

  CHURCH_NAME_MIN: 3,
  CHURCH_ADDRESS_MIN: 5,

  USERNAME_MIN: 3,
  USERNAME_MAX: 60,

  PASSWORD_MIN: 8,
  PASSWORD_MAX: 64,

  /** A CPF is always eleven digits once punctuation is stripped. */
  CPF_DIGITS: 11,
} as const
