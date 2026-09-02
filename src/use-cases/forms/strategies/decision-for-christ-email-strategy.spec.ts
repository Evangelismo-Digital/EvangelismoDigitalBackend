import { describe, it, expect, beforeEach } from 'vitest'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email-strategy'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { isOk, isErr } from 'core/shared/result'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'
import { env } from '@env/index'

describe('DecisionForChristEmailStrategy', () => {
  let strategy: DecisionForChristEmailStrategy

  beforeEach(() => {
    strategy = new DecisionForChristEmailStrategy()
  })

  describe('buildUserEmail', () => {
    it('builds a decision-for-Christ email addressed to the submitter', () => {
      const result = strategy.buildUserEmail({ name: 'Maria', email: 'maria@test.com' })

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe('maria@test.com')
      expect(result.value.context).toEqual({ type: 'decision-for-Christ', recipient: 'user' })
      expect(result.value.message).toContain('Maria')
      expect(result.value.html).toContain('Maria')
    })

    it('fails with form.email when email is not a string', () => {
      const result = strategy.buildUserEmail({ name: 'Maria', email: 1 } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error).toBeInstanceOf(InvalidFormPayloadError)
      expect(result.error.message).toContain('form.email')
    })

    it('fails with form.name when name is missing', () => {
      const result = strategy.buildUserEmail({ email: 'maria@test.com' } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.name')
    })
  })

  describe('buildStaffEmail', () => {
    const complete = {
      name: 'Maria',
      lastName: 'Souza',
      email: 'maria@test.com',
      location: 'Recife, PE',
      ipAddress: '203.0.113.7',
    }

    it('builds an internal email addressed to ADMIN_EMAIL with all fields', () => {
      const result = strategy.buildStaffEmail(complete)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe(env.ADMIN_EMAIL)
      expect(result.value.context).toEqual({ type: 'decision-for-Christ', recipient: 'internal' })
      expect(result.value.message).toContain('203.0.113.7')
      // lastName and location must reach the HTML body
      expect(result.value.html).toContain('Souza')
      expect(result.value.html).toContain('Recife, PE')
    })

    it('fails with form.email when the staff email address is invalid', () => {
      const result = strategy.buildStaffEmail({ ...complete, email: 123 } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.email')
    })

    it('requires lastName (not optional here) and fails with form.lastName when missing', () => {
      const { lastName, ...withoutLastName } = complete
      void lastName
      const result = strategy.buildStaffEmail(withoutLastName as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.lastName')
    })

    it('treats an absent location identically to an empty-string location', () => {
      const { location, ...withoutLocation } = complete
      void location
      const absent = strategy.buildStaffEmail(withoutLocation)
      const empty = strategy.buildStaffEmail({ ...complete, location: '' })

      expect(isOk(absent)).toBe(true)
      expect(isOk(empty)).toBe(true)
      if (!isOk(absent) || !isOk(empty)) return
      expect(absent.value).toEqual(empty.value)
      expect(absent.value.html).not.toContain('Stryker')
      expect(absent.value.html).not.toContain('undefined')
    })

    it('rejects a non-string location with form.location', () => {
      const result = strategy.buildStaffEmail({
        ...complete,
        location: 99,
      } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.location')
    })

    it('includes a string ipAddress but never a non-string one', () => {
      const nullIp = strategy.buildStaffEmail({ ...complete, ipAddress: null })
      const numericIp = strategy.buildStaffEmail({
        ...complete,
        ipAddress: 20250102,
      } as unknown as FormPayload)

      const stringIp = strategy.buildStaffEmail(complete)

      expect(isOk(nullIp) && isOk(numericIp) && isOk(stringIp)).toBe(true)
      if (!isOk(nullIp) || !isOk(numericIp) || !isOk(stringIp)) return
      expect(stringIp.value.message).toContain('203.0.113.7')
      expect(nullIp.value.message).not.toContain('203.0.113.7')
      expect(numericIp.value.message).not.toContain('20250102')
      expect(numericIp.value.html).not.toContain('20250102')
    })

    it('validates fields in order: email, then name, then lastName', () => {
      const result = strategy.buildStaffEmail({
        email: 'maria@test.com',
        name: 5,
        lastName: 6,
      } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.name')
    })
  })
})
