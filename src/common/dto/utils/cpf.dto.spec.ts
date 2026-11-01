/**
 * cpfSchema delegates the checksum to `cpf-cnpj-validator`. That dependency was
 * upgraded across a major version (1.0.3 → 2.1.2) to drop the vulnerable
 * @hapi/joi it bundled, and nothing pinned what "a valid CPF" means here — so a
 * future upgrade could quietly widen or narrow the CPFs that registration,
 * login and password reset accept. These properties pin it against an
 * independent reference implementation of the Receita Federal mod-11 rule.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { cpfSchema } from './cpf.dto'
import { VALIDATION_CONSTANTS } from '@common/messages/constants/validation/validation'

/** Rejected despite a correct checksum: every repeated digit, plus the classic sequence. */
const BLOCKLIST = new Set([...Array.from({ length: 10 }, (_, d) => String(d).repeat(11)), '12345678909'])

function checkDigit(digits: string): number {
  const weightStart = digits.length + 1
  const sum = [...digits].reduce((acc, digit, i) => acc + Number(digit) * (weightStart - i), 0)
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

/** Reference oracle, written from the specification rather than from the library. */
function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || BLOCKLIST.has(cpf)) return false
  const first = checkDigit(cpf.slice(0, 9))
  const second = checkDigit(cpf.slice(0, 9) + String(first))
  return cpf.endsWith(`${first}${second}`)
}

function withCheckDigits(base: string): string {
  const first = checkDigit(base)
  return `${base}${first}${checkDigit(base + String(first))}`
}

const formatted = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`

const elevenDigits = fc.stringMatching(/^\d{11}$/)
const validCpf = fc
  .stringMatching(/^\d{9}$/)
  .map(withCheckDigits)
  .filter((cpf) => !BLOCKLIST.has(cpf))

describe('cpfSchema', () => {
  it('accepts exactly the 11-digit strings the mod-11 rule accepts', () => {
    fc.assert(
      fc.property(elevenDigits, (cpf) => {
        expect(cpfSchema.safeParse(cpf).success).toBe(isValidCpf(cpf))
      }),
      { numRuns: 5000 },
    )
  })

  it('accepts every CPF with correct check digits and returns it formatted', () => {
    fc.assert(
      fc.property(validCpf, (cpf) => {
        expect(cpfSchema.parse(cpf)).toBe(formatted(cpf))
      }),
      { numRuns: 2000 },
    )
  })

  it('accepts the same CPF typed with its mask', () => {
    // Counterweight to the strictness below: punctuation is stripped before
    // validation, so a user pasting "529.982.247-25" is not turned away.
    fc.assert(
      fc.property(validCpf, (cpf) => {
        expect(cpfSchema.parse(formatted(cpf))).toBe(formatted(cpf))
      }),
      { numRuns: 500 },
    )
  })

  it('rejects a valid CPF with a single check digit altered', () => {
    fc.assert(
      fc.property(validCpf, fc.integer({ min: 1, max: 9 }), (cpf, delta) => {
        const tampered = cpf.slice(0, 10) + String((Number(cpf[10]) + delta) % 10)

        expect(cpfSchema.safeParse(tampered).success).toBe(false)
      }),
      { numRuns: 1000 },
    )
  })

  it.each([...BLOCKLIST])('rejects %s even though its checksum works out', (cpf) => {
    const result = cpfSchema.safeParse(cpf)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(VALIDATION_CONSTANTS.CPF.INVALID)
  })

  it.each([52998224725, null, undefined, { cpf: '52998224725' }])(
    'rejects the non-string %j as invalid instead of throwing',
    (input) => {
      // The preprocess strips punctuation from strings only; anything else must
      // reach z.string() and fail validation, not crash on `.replace`.
      expect(() => cpfSchema.safeParse(input)).not.toThrow()
      expect(cpfSchema.safeParse(input).success).toBe(false)
    },
  )

  it.each(['', '5299822472', '529982247250', 'abcdefghijk'])('rejects %j with the CPF message', (input) => {
    const result = cpfSchema.safeParse(input)

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(VALIDATION_CONSTANTS.CPF.INVALID)
  })
})
