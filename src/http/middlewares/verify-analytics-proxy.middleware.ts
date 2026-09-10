import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '@env/index'
import { HTTP_STATUS } from '@http/http-status'
import { ANALYTICS_ERRORS } from 'messages/errors/analytics'

export const ANALYTICS_PROXY_HEADER = 'x-analytics-proxy'

/**
 * Constant-time comparison of two secrets of unknown length.
 *
 * `timingSafeEqual` throws when the buffers differ in length, and guarding that
 * with an early `length` check would leak the secret's size — enough to shorten
 * a search meaningfully. Hashing both sides first makes the comparison operate
 * on two fixed 32-byte digests, so length never reaches the comparison and the
 * work done is identical for every input.
 *
 * A plain `===` would be worse still: V8 short-circuits on the first differing
 * byte, which is the classic side channel that lets a secret be recovered one
 * character at a time.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const presentedDigest = createHash('sha256').update(presented).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()

  return timingSafeEqual(presentedDigest, expectedDigest)
}

/**
 * Refuses any analytics request that did not arrive through the first-party
 * Next.js proxy.
 *
 * The proxy is what makes these cookies first-party — see §2 of
 * docs/analytics-cookie-architecture.md. A request reaching the API directly
 * either bypasses that design or is writing analytics on purpose, and neither is
 * something to serve. Unlike the silent `204` used for missing identity, this
 * one is a loud `401`: the caller here is infrastructure, not a browser, and a
 * misconfigured proxy should fail visibly rather than quietly stop collecting.
 */
export async function verifyAnalyticsProxy(request: FastifyRequest, reply: FastifyReply) {
  const presented = request.headers[ANALYTICS_PROXY_HEADER]

  // A repeated header arrives as an array; there is no legitimate reason for the
  // proxy to send two, so it is refused rather than having one of them picked.
  if (typeof presented !== 'string' || !secretsMatch(presented, env.ANALYTICS_PROXY_SECRET)) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: ANALYTICS_ERRORS.PROXY_REQUIRED.message })
  }
}
