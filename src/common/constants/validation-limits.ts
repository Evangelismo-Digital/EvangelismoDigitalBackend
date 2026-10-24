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

  /**
   * Analytics ingestion ceilings (§4.2).
   *
   * The previous schema had none — `eventType` and `path` were `z.string()` and
   * `payload` was `z.record(z.any())`. With Fastify's default 1 MiB body limit
   * and 300 req/min/IP that is roughly 300 MB/min/IP of arbitrary JSON going
   * straight into Postgres, without forging anything.
   */
  ANALYTICS_PATH_MAX: 2048,
  ANALYTICS_TITLE_MAX: 512,
  ANALYTICS_REFERRER_MAX: 2048,
  ANALYTICS_LANGUAGE_MAX: 35,
  ANALYTICS_PAYLOAD_VALUE_MAX: 512,
  ANALYTICS_PAYLOAD_KEYS_MAX: 20,
  ANALYTICS_EVENTS_PER_BATCH_MAX: 50,
  /** A day in milliseconds: anything longer is a clock problem, not a reading. */
  ANALYTICS_DURATION_MS_MAX: 86_400_000,
  ANALYTICS_SCROLL_DEPTH_MAX: 100,

  /** A UUIDv7 with room to spare; the value is opaque and always ours. */
  ANALYTICS_VISITOR_ID_MAX: 64,
  ANALYTICS_READ_PAGE_DEFAULT: 50,
  ANALYTICS_READ_PAGE_MAX: 200,
  /** Visits shown alongside a visitor profile, newest first. */
  ANALYTICS_READ_VISITS_LIMIT: 100,
} as const
