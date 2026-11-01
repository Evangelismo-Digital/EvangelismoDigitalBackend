/**
 * The RESP version every Redis connection speaks.
 *
 * ioredis 6 changed its default to RESP3. It was adopted for a security fix
 * (SNYK-JS-IOREDIS-19963957, the parser stack overflow), not to change the
 * protocol under BullMQ, the distributed lock, the cache, the outbox pub/sub and
 * the rate limiter — so each connection keeps the RESP2 that ioredis 5 spoke.
 * The parser fix applies to both protocols; moving to RESP3 is a separate,
 * deliberate change, and this constant is the one place to make it.
 */
export const REDIS_WIRE_PROTOCOL = 2 as const
