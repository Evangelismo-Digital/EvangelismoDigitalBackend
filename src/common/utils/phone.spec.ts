import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { INVALID_PHONE_MESSAGE, formatPhone, isValidBrazilPhone, normalizePhone, optionalPhoneSchema } from './phone'

const areaCode = fc.constantFrom(11, 19, 21, 22, 24, 27, 28, 31, 38, 41, 49, 51, 55, 61, 69, 71, 79, 81, 89, 91, 99)
const digitsOf = (length: number) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: length, maxLength: length })

const mobile = fc.tuple(areaCode, digitsOf(8)).map(([ddd, rest]) => `${ddd}9${rest.join('')}`)
const landline = fc
  .tuple(areaCode, fc.integer({ min: 2, max: 5 }), digitsOf(7))
  .map(([ddd, first, rest]) => `${ddd}${first}${rest.join('')}`)

describe('normalizePhone', () => {
  it('keeps only the digits', () => {
    expect(normalizePhone('(21) 98765-4321')).toBe('21987654321')
    expect(normalizePhone('+55 (21) 2345-6789')).toBe('552123456789')
  })
})

describe('isValidBrazilPhone', () => {
  it('accepts every mobile and landline with a real area code', () => {
    fc.assert(
      fc.property(fc.oneof(mobile, landline), (digits) => {
        expect(isValidBrazilPhone(digits)).toBe(true)
      }),
    )
  })

  it.each(['21987654321', '2123456789', '2153456789', '11912345678', '99987654321'])('accepts %s', (digits) => {
    expect(isValidBrazilPhone(digits)).toBe(true)
  })

  it.each([
    ['an unused area code', '20987654321'],
    ['area code 10', '1023456789'],
    ['area code 23', '2323456789'],
    ['a landline starting with 1', '2113456789'],
    ['a landline starting with 6', '2163456789'],
    ['a landline starting with 9', '2193456789'],
    ['an 11-digit number not starting with 9', '21887654321'],
    ['a 9-digit number', '219876543'],
    ['a 12-digit number', '219876543210'],
    ['the country code in front', '5521987654321'],
    ['empty', ''],
    ['punctuation left in', '(21) 98765-4321'],
    ['characters before a mobile', 'x21987654321'],
    ['characters after a mobile', '21987654321x'],
    ['characters before a landline', 'x2123456789'],
    ['characters after a landline', '2123456789x'],
  ])('rejects %s', (_, digits) => {
    expect(isValidBrazilPhone(digits)).toBe(false)
  })

  it('rejects any valid mobile with an extra digit', () => {
    fc.assert(
      fc.property(mobile, fc.integer({ min: 0, max: 9 }), (digits, extra) => {
        expect(isValidBrazilPhone(`${digits}${extra}`)).toBe(false)
      }),
    )
  })
})

describe('formatPhone', () => {
  it('formats a mobile and a landline', () => {
    expect(formatPhone('21987654321')).toBe('(21) 98765-4321')
    expect(formatPhone('2123456789')).toBe('(21) 2345-6789')
  })

  it.each(['', '2198765', '20987654321', '(21) 98765-4321'])(
    'returns %j as given when it is not a valid number',
    (value) => {
      expect(formatPhone(value)).toBe(value)
    },
  )
})

describe('optionalPhoneSchema', () => {
  it('turns a masked number into digits', () => {
    expect(optionalPhoneSchema.parse('(21) 98765-4321')).toBe('21987654321')
    expect(optionalPhoneSchema.parse('21 2345 6789')).toBe('2123456789')
  })

  it.each([undefined, '', '() -'])('collapses a missing or blank phone (%j) to undefined', (phone) => {
    expect(optionalPhoneSchema.parse(phone)).toBeUndefined()
  })

  it('rejects an invalid number with the pt-BR message', () => {
    const result = optionalPhoneSchema.safeParse('(21) 9876-543')

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([INVALID_PHONE_MESSAGE])
    expect(INVALID_PHONE_MESSAGE).toBe('Telefone inválido. Informe um número brasileiro com DDD.')
  })

  it('rejects a non-string', () => {
    expect(optionalPhoneSchema.safeParse(21987654321).success).toBe(false)
  })
})
