import { describe, it, expect, beforeEach } from 'vitest'
import { ContactEmailStrategy } from './contact-email-strategy'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { isOk, isErr } from 'core/shared/result'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'
import { env } from '@env/index'

describe('ContactEmailStrategy', () => {
  let strategy: ContactEmailStrategy

  beforeEach(() => {
    strategy = new ContactEmailStrategy()
  })

  describe('buildUserEmail', () => {
    it('builds a user-facing email addressed to the submitter', () => {
      const result = strategy.buildUserEmail({ name: 'João', email: 'joao@test.com' })

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe('joao@test.com')
      expect(result.value.context).toEqual({ type: 'contact', recipient: 'user' })
      expect(typeof result.value.subject).toBe('string')
      expect(result.value.subject.length).toBeGreaterThan(0)
      expect(result.value.message).toContain('João')
      expect(result.value.html).toContain('João')
    })

    it('fails with form.email when email is not a string', () => {
      const result = strategy.buildUserEmail({ name: 'João', email: 123 } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error).toBeInstanceOf(InvalidFormPayloadError)
      expect(result.error.message).toContain('form.email')
    })

    it('checks email before name (short-circuits on the first invalid field)', () => {
      const result = strategy.buildUserEmail({ email: undefined, name: undefined } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.email')
    })

    it('fails with form.name when name is missing but email is valid', () => {
      const result = strategy.buildUserEmail({ email: 'joao@test.com' } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.name')
    })
  })

  describe('buildStaffEmail', () => {
    it('builds an internal email addressed to ADMIN_EMAIL', () => {
      const result = strategy.buildStaffEmail({
        name: 'João',
        lastName: 'Silva',
        email: 'joao@test.com',
        ipAddress: '203.0.113.9',
      })

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe(env.ADMIN_EMAIL)
      expect(result.value.context).toEqual({ type: 'contact', recipient: 'internal' })
      expect(result.value.message).toContain('203.0.113.9')
      // lastName must reach the HTML body (guards the `|| ''` fallback in getOptionalStringField)
      expect(result.value.html).toContain('Silva')
    })

    it('treats an absent lastName identically to an empty-string lastName', () => {
      const absent = strategy.buildStaffEmail({ name: 'João', email: 'joao@test.com' })
      const empty = strategy.buildStaffEmail({ name: 'João', email: 'joao@test.com', lastName: '' })

      expect(isOk(absent)).toBe(true)
      expect(isOk(empty)).toBe(true)
      if (!isOk(absent) || !isOk(empty)) return
      expect(absent.value).toEqual(empty.value)
      expect(absent.value.html).not.toContain('Stryker')
      expect(absent.value.html).not.toContain('undefined')
    })

    it('checks email, then name, then lastName in order', () => {
      const badEmail = strategy.buildStaffEmail({ email: 1, name: 2, lastName: 3 } as unknown as FormPayload)
      const badName = strategy.buildStaffEmail({
        email: 'joao@test.com',
        name: 2,
        lastName: 3,
      } as unknown as FormPayload)

      expect(isErr(badEmail)).toBe(true)
      expect(isErr(badName)).toBe(true)
      if (!isErr(badEmail) || !isErr(badName)) return
      expect(badEmail.error.message).toContain('form.email')
      expect(badName.error.message).toContain('form.name')
    })

    it('rejects a non-string lastName with form.lastName', () => {
      const result = strategy.buildStaffEmail({
        name: 'João',
        email: 'joao@test.com',
        lastName: 42,
      } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.lastName')
    })

    it('includes a string ipAddress but never a non-string one', () => {
      const withIp = strategy.buildStaffEmail({
        name: 'João',
        email: 'joao@test.com',
        ipAddress: '198.51.100.4',
      })
      // A truthy non-string value would leak into the template if the type guard were removed.
      const numericIp = strategy.buildStaffEmail({
        name: 'João',
        email: 'joao@test.com',
        ipAddress: 20250102,
      } as unknown as FormPayload)

      expect(isOk(withIp)).toBe(true)
      expect(isOk(numericIp)).toBe(true)
      if (!isOk(withIp) || !isOk(numericIp)) return
      expect(withIp.value.message).toContain('198.51.100.4')
      expect(numericIp.value.message).not.toContain('20250102')
      expect(numericIp.value.html).not.toContain('20250102')
    })

    it('fails with form.email when email is invalid', () => {
      const result = strategy.buildStaffEmail({ name: 'João', email: false } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.email')
    })
  })
})
