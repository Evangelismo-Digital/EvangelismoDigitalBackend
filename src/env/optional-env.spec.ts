/**
 * The blank-variable rule, tested in isolation.
 *
 * `src/env/index.ts` validates at import and throws on failure, so it cannot be
 * exercised directly without a hand-built process environment. The rule that
 * actually mattered — blank means unset — lives here instead, where it can be
 * asserted against the same schemas the real config uses.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { optionalEnv } from './optional-env'

describe('optionalEnv — a blank value means unset', () => {
  it('treats a blank URL as absent instead of refusing to boot', () => {
    const schema = optionalEnv(z.url())

    const result = schema.safeParse('')

    // `z.url().optional()` REFUSED this, so blanking DATABASE_URL_LOCAL — the
    // ordinary way to disable it — crashed startup over a value nobody set.
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeUndefined()
  })

  it('treats a blank string as absent instead of passing an empty one through', () => {
    const schema = optionalEnv(z.string())

    const result = schema.safeParse('')

    // `z.string().optional()` ACCEPTED this, which is quieter and worse: an
    // empty REDIS_PASSWORD becomes an AUTH with a blank password.
    if (result.success) expect(result.data).toBeUndefined()
  })

  it('treats a blank value as absent even when the schema has a minimum length', () => {
    const schema = optionalEnv(z.string().min(32))

    const result = schema.safeParse('')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeUndefined()
  })

  it('accepts an absent value', () => {
    const result = optionalEnv(z.url()).safeParse(undefined)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeUndefined()
  })
})

describe('optionalEnv — a present value is still validated', () => {
  it('passes a valid value through unchanged', () => {
    const result = optionalEnv(z.url()).safeParse('postgresql://user:pass@localhost:5432/db')

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('postgresql://user:pass@localhost:5432/db')
  })

  /**
   * COUNTERWEIGHT. Normalising blank to undefined must not turn into skipping
   * validation: a preprocess that swallowed everything would satisfy every test
   * above, and a malformed URL would then reach Prisma instead of failing at
   * boot — which is the entire reason the variable is validated.
   */
  it('still REFUSES a malformed value', () => {
    expect(optionalEnv(z.url()).safeParse('not-a-url').success).toBe(false)
  })

  it('still enforces a minimum length on a value that is present', () => {
    expect(optionalEnv(z.string().min(32)).safeParse('too-short').success).toBe(false)
  })

  it('does not treat whitespace as blank', () => {
    // Only a genuinely empty value is "unset". A space is a value someone typed,
    // and silently discarding it would hide a configuration mistake.
    expect(optionalEnv(z.string().min(32)).safeParse(' ').success).toBe(false)
  })
})
