import type { FastifyRequest } from 'fastify'

/**
 * The client's address as seen through a proxy.
 *
 * The left-most entry of X-Forwarded-For is the original client; the header may
 * arrive repeated (an array) or as one comma-separated string. Falls back to the
 * socket address when the header is absent.
 *
 * Shared because the analytics controller and the request-lifecycle log derived
 * it with identical code, and an IP that two layers disagree about is worse than
 * no IP at all.
 */
export function clientIpOf(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']

  if (Array.isArray(forwarded)) {
    return forwarded[0]
  }

  return forwarded?.split(',')[0].trim() || request.ip
}
