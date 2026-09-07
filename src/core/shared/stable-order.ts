/**
 * Orders strings by UTF-16 code unit, explicitly and identically everywhere.
 *
 * This exists to say "no" to a tempting piece of advice. Static analysis flags
 * `array.sort()` without a comparator and suggests `String.localeCompare`,
 * which is right for anything a person reads — and wrong for both callers here,
 * because both sort key names to build a *cache key*:
 *
 *   - `getHttpsAgent` hashes the sorted config keys to reuse one agent per
 *     distinct configuration;
 *   - `ResilientCache.generateKey` hashes the sorted parameter names into the
 *     Redis key a value is stored under.
 *
 * `localeCompare` orders by the runtime's collation, which varies with ICU data
 * and the active locale. A container that came up with a different locale would
 * hash the same parameters into a different key: a cache that silently splits
 * in half, and an agent pool that quietly doubles. Deterministic beats
 * human-friendly whenever the output is an identifier rather than a list.
 */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}
