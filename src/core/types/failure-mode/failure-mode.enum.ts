/**
 * FailureMode classifies AppErrors into machine-readable buckets so that
 * resilient fallback chains and cache managers can route errors without
 * resorting to `instanceof` checks.
 *
 * - RETRYABLE: infrastructure is temporarily unavailable; try the next provider.
 * - NOT_FOUND: this provider genuinely does not have the resource. The chain
 *   treats it exactly like an `ok(null)` response — it counts the miss and asks
 *   the *next* provider, because another one may well know the answer. Only
 *   once every provider has said NOT_FOUND does the chain synthesize a
 *   terminal InvalidCepError / CoordinatesNotFoundError, which is what gets
 *   negative-cached.
 * - PERMANENT: the request is deterministically unanswerable for this input,
 *   but the resource was not merely "absent" (e.g. candidates were found yet
 *   none are reachable). Like NOT_FOUND it is safe to negative-cache; unlike
 *   NOT_FOUND it carries no 404 connotation, so errors keep their own
 *   ErrorType. Fallback chains treat it as terminal, the same as NOT_FOUND.
 * - ABORTED: the work was cancelled before it could produce an answer — the
 *   request budget ran out, or the caller went away. Terminal like NOT_FOUND
 *   and PERMANENT (there is no point asking the next provider a question we no
 *   longer have time to hear the answer to), but emphatically **not**
 *   cacheable: nothing was learned about the input, only about the clock.
 *
 * The two axes are independent, and ABORTED is what completes the matrix.
 * Note that "advances the chain" and "negative-cached" are answered by
 * different layers — the resilient chains and the cache policy respectively —
 * which is why NOT_FOUND both keeps asking and is ultimately cached:
 *
 * |             | advances the chain | negative-cached |
 * |-------------|--------------------|-----------------|
 * | RETRYABLE   | yes                | no              |
 * | NOT_FOUND   | yes                | yes             |
 * | PERMANENT   | no                 | yes             |
 * | ABORTED     | no                 | no              |
 *
 * Only PERMANENT and ABORTED stop a chain early; they reach the chains'
 * default "terminal error" branch rather than a dedicated one.
 */
export enum FailureMode {
  RETRYABLE = 'RETRYABLE',
  NOT_FOUND = 'NOT_FOUND',
  PERMANENT = 'PERMANENT',
  ABORTED = 'ABORTED',
}
