import fastifyCookie from '@fastify/cookie'
import fc from 'fast-check'
import fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { cookieSigningSecrets } from './cookie-secrets'

const CURRENT = 'current-secret-current-secret-current-secret-32+'
const PREVIOUS = 'previous-secret-previous-secret-previous-secret'

describe('cookieSigningSecrets', () => {
  it('signs with the current secret when no previous one is configured', () => {
    expect(cookieSigningSecrets(CURRENT)).toEqual([CURRENT])
  })

  it('puts the current secret first so it is the one that signs', () => {
    expect(cookieSigningSecrets(CURRENT, PREVIOUS)).toEqual([CURRENT, PREVIOUS])
  })

  it('drops a previous secret identical to the current one', () => {
    expect(cookieSigningSecrets(CURRENT, CURRENT)).toEqual([CURRENT])
  })

  it('drops an empty previous secret rather than accepting a zero-length key', () => {
    expect(cookieSigningSecrets(CURRENT, '')).toEqual([CURRENT])
  })

  it('always yields the current secret at index 0, for any pair of inputs', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.option(fc.string(), { nil: undefined }), (current, previous) => {
        const secrets = cookieSigningSecrets(current, previous)

        expect(secrets[0]).toBe(current)
        expect(secrets.length).toBeLessThanOrEqual(2)
        expect(secrets).not.toContain('')
        expect(new Set(secrets).size).toBe(secrets.length)
      }),
    )
  })
})

/**
 * The claim the rotation procedure rests on, verified against the library rather
 * than assumed: a cookie signed under the *previous* secret still unsigns after
 * the new one has been deployed. If `@fastify/cookie` ever changed this, the
 * failure in production would be 13 months of visitor cookies going anonymous at
 * once — silently, since an invalid signature reads as "no cookie".
 */
describe('secret rotation through @fastify/cookie', () => {
  async function appSignedWith(secret: string | string[]) {
    const app = fastify()
    await app.register(fastifyCookie, { secret })
    await app.ready()
    return app
  }

  it('accepts a cookie signed with the previous secret', async () => {
    const oldApp = await appSignedWith(PREVIOUS)
    const signedUnderOldKey = oldApp.signCookie('visitor-abc')
    await oldApp.close()

    const rotated = await appSignedWith(cookieSigningSecrets(CURRENT, PREVIOUS))

    expect(rotated.unsignCookie(signedUnderOldKey)).toMatchObject({ valid: true, value: 'visitor-abc' })

    await rotated.close()
  })

  it('rejects a cookie signed with a secret that is in neither slot', async () => {
    const strangerApp = await appSignedWith('stranger-secret-stranger-secret-stranger-32+')
    const signedElsewhere = strangerApp.signCookie('visitor-abc')
    await strangerApp.close()

    const rotated = await appSignedWith(cookieSigningSecrets(CURRENT, PREVIOUS))

    expect(rotated.unsignCookie(signedElsewhere)).toMatchObject({ valid: false })

    await rotated.close()
  })

  it('signs new cookies with the current secret, not the previous one', async () => {
    const rotated = await appSignedWith(cookieSigningSecrets(CURRENT, PREVIOUS))
    const freshlySigned = rotated.signCookie('visitor-abc')
    await rotated.close()

    const currentOnly = await appSignedWith(CURRENT)
    const previousOnly = await appSignedWith(PREVIOUS)

    expect(currentOnly.unsignCookie(freshlySigned)).toMatchObject({ valid: true, value: 'visitor-abc' })
    expect(previousOnly.unsignCookie(freshlySigned)).toMatchObject({ valid: false })

    await currentOnly.close()
    await previousOnly.close()
  })
})
