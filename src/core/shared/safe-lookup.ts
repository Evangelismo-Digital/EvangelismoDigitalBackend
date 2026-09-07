/**
 * Reads a key out of a lookup table without ever reaching the prototype chain.
 *
 * `table[key]` looks safe and is not, whenever `key` came from outside the
 * process. Every plain object inherits from `Object.prototype`, so
 * `table['constructor']`, `table['toString']` and `table['valueOf']` all return
 * a function even when the table defines nothing of the sort — and the caller,
 * having written `if (factory)` or `?? fallback`, sails straight past its own
 * guard with a value it never registered.
 *
 * That is not hypothetical here: {@link deserializeAppError} is handed a `type`
 * string read back out of a Redis cache envelope, and `toHttpStatus` a `type`
 * carried on an error that may itself have come from one.
 *
 * `Object.hasOwn` answers the question the caller actually meant — "is this a
 * key I put here?" — and inherited properties answer no.
 */
export function safeLookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}
