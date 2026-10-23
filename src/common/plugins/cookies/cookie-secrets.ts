/**
 * The secrets `@fastify/cookie` signs and verifies with, in precedence order.
 *
 * The library signs with the **first** entry and accepts a signature produced by
 * any entry, which is the whole mechanism behind rotating a key without
 * invalidating cookies already in browsers. Order is therefore not cosmetic:
 * swapping the two would keep old cookies valid while signing new ones with the
 * key that is on its way out.
 *
 * Expressed as a function over two values rather than read from `env` at module
 * scope so the rotation rule can be tested for what it is — a pure decision
 * about ordering and presence — instead of through a process-wide environment.
 *
 * Two inputs are rejected rather than passed through: an empty `previous`, which
 * would put a zero-length signing key in the accepted set, and a `previous` equal
 * to `current`, which is what a copy-paste in a deploy config looks like and
 * would cost every unsigned cookie a second, identical verification.
 */
export function cookieSigningSecrets(current: string, previous?: string): string[] {
  if (!previous || previous === current) {
    return [current]
  }

  return [current, previous]
}
