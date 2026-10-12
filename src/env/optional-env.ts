import { z } from 'zod'

/**
 * An optional environment variable, where a declared-but-blank `FOO=` counts as
 * absent rather than as the empty string.
 *
 * dotenv reports `FOO=` as `''`, not as a missing key, so `.optional()` alone
 * does not cover it — `.optional()` admits `undefined` and nothing else. The
 * consequences differ by schema and none of them are good:
 *
 *   - `z.url().optional()` REFUSES `''`, so the process will not boot. Both
 *     `DATABASE_URL_LOCAL` and `SHADOW_DATABASE_URL` were in this state: a
 *     variable blanked out — which is how an operator normally disables one —
 *     crashed startup with a validation error about a value nobody set.
 *   - `z.string().optional()` ACCEPTS `''` and passes it on, which is worse for
 *     being quiet: an empty `REDIS_PASSWORD` becomes an AUTH attempt with a
 *     blank password rather than no AUTH at all, and an empty `SENTRY_DSN`
 *     reaches Sentry's initialiser as a configured-but-meaningless value.
 *
 * Normalising once, here, means every optional variable behaves the way an
 * operator expects: blank means unset.
 */
export function optionalEnv<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional())
}
