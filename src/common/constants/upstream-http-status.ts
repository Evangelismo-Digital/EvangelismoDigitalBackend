/**
 * HTTP status codes as returned *by the upstream providers* we call.
 *
 * Deliberately separate from `@http/http-status`, which describes the statuses
 * **this** API answers with. They overlap numerically and mean opposite things:
 * `429` here is "ViaCEP is rate-limiting us", not "we are rate-limiting a
 * client". Importing the response-side constants into a provider or an error
 * mapper made inner layers depend on the HTTP layer in order to describe
 * somebody else's behaviour — a dependency pointing the wrong way for a value
 * that has nothing to do with our own API contract.
 *
 * Two names for 429 is the point, not an oversight: the day our own
 * rate-limiting policy changes, nothing in this file should move.
 */
export const UPSTREAM_STATUS = {
  /** The provider is throttling us — retryable, and a reason to fall through. */
  TOO_MANY_REQUESTS: 429,
  /** The provider answered authoritatively that the resource does not exist. */
  NOT_FOUND: 404,
} as const

/** Lower bound of the 2xx range, for `validateStatus`-style predicates. */
export const UPSTREAM_SUCCESS_MIN = 200

/** Exclusive upper bound of the 2xx range. */
export const UPSTREAM_SUCCESS_MAX_EXCLUSIVE = 300
