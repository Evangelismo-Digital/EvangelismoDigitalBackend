import { describe, it, expect, beforeEach } from 'vitest'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email.strategy'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { isOk, isErr } from '@common/utils/result'
import { InvalidFormPayloadError } from '@modules/forms/errors/invalid-form-payload-error'
import { env } from '@config/env/index'

describe('DecisionForChristEmailStrategy', async () => {
  let strategy: DecisionForChristEmailStrategy

  beforeEach(() => {
    strategy = new DecisionForChristEmailStrategy()
  })

  describe('buildUserEmail', async () => {
    it('async builds a decision-for-Christ email addressed to the submitter', async () => {
      const result = await strategy.buildUserEmail({ name: 'Maria', email: 'maria@test.com' })

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe('maria@test.com')
      expect(result.value.context).toEqual({ type: 'decision-for-Christ', recipient: 'user' })
      expect(result.value.message).toContain('Maria')
      expect(result.value.html).toContain('Maria')
    })

    it('async fails with form.email when email is not a string', async () => {
      const result = await strategy.buildUserEmail({ name: 'Maria', email: 1 } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error).toBeInstanceOf(InvalidFormPayloadError)
      expect(result.error.message).toContain('form.email')
    })

    it('async fails with form.name when name is missing', async () => {
      const result = await strategy.buildUserEmail({ email: 'maria@test.com' } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.name')
    })
  })

  describe('buildStaffEmail', async () => {
    const complete = {
      name: 'Maria',
      lastName: 'Souza',
      email: 'maria@test.com',
      location: 'Recife, PE',
      ipAddress: '203.0.113.7',
    }

    it('async builds an internal email addressed to ADMIN_EMAIL with all fields', async () => {
      const result = await strategy.buildStaffEmail(complete)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.to).toBe(env.ADMIN_EMAIL)
      expect(result.value.context).toEqual({ type: 'decision-for-Christ', recipient: 'internal' })
      expect(result.value.message).toContain('203.0.113.7')
      // lastName and location must reach the HTML body
      expect(result.value.html).toContain('Souza')
      expect(result.value.html).toContain('Recife, PE')
    })

    it('async fails with form.email when the staff email address is invalid', async () => {
      const result = await strategy.buildStaffEmail({ ...complete, email: 123 } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.email')
    })

    it('async requires lastName (not optional here) and fails with form.lastName when missing', async () => {
      const { lastName, ...withoutLastName } = complete
      void lastName
      const result = await strategy.buildStaffEmail(withoutLastName as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.lastName')
    })

    it('async treats an absent location identically to an empty-string location', async () => {
      const { location, ...withoutLocation } = complete
      void location
      const absent = await strategy.buildStaffEmail(withoutLocation)
      const empty = await strategy.buildStaffEmail({ ...complete, location: '' })

      expect(isOk(absent)).toBe(true)
      expect(isOk(empty)).toBe(true)
      if (!isOk(absent) || !isOk(empty)) return
      expect(absent.value).toEqual(empty.value)
      expect(absent.value.html).not.toContain('Stryker')
      expect(absent.value.html).not.toContain('undefined')
    })

    it('async rejects a non-string location with form.location', async () => {
      const result = await strategy.buildStaffEmail({
        ...complete,
        location: 99,
      } as unknown as FormPayload)

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error.message).toContain('form.location')
    })

    it('async shows a given phone formatted, and nothing for an absent, empty or non-string one', async () => {
      const withPhone = await strategy.buildStaffEmail({ ...complete, phone: '21987654321' })
      const variants = await Promise.all(
        [
          { ...complete },
          { ...complete, phone: '' },
          { ...complete, phone: null },
          { ...complete, phone: 21987654321 },
        ].map((form) => strategy.buildStaffEmail(form as unknown as FormPayload)),
      )

      expect(isOk(withPhone)).toBe(true)
      if (!isOk(withPhone)) return
      expect(withPhone.value.message).toContain('Telefone: (21) 98765-4321')
      expect(withPhone.value.html).toContain('Telefone:')
      expect(withPhone.value.html).toContain('(21) 98765-4321')
      for (const result of variants) {
        expect(isOk(result)).toBe(true)
        if (!isOk(result)) return
        expect(result.value.message).not.toContain('Telefone')
        expect(result.value.html).not.toContain('Telefone')
        expect(result.value.html).not.toContain('21987654321')
      }
    })

    it('async includes a string ipAddress but never a non-string one', async () => {
      const nullIp = await strategy.buildStaffEmail({ ...complete, ipAddress: null })
      const numericIp = await strategy.buildStaffEmail({
        ...complete,
        ipAddress: 20250102,
      } as unknown as FormPayload)

      const stringIp = await strategy.buildStaffEmail(complete)

      expect(isOk(nullIp) && isOk(numericIp) && isOk(stringIp)).toBe(true)
      if (!isOk(nullIp) || !isOk(numericIp) || !isOk(stringIp)) return
      expect(stringIp.value.message).toContain('203.0.113.7')
      expect(nullIp.value.message).not.toContain('203.0.113.7')
      expect(numericIp.value.message).not.toContain('20250102')
      expect(numericIp.value.html).not.toContain('20250102')
    })

    it('async validates fields in order: email, then name, then lastName', async () => {
      const result = await strategy.buildStaffEmail({
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
