import z from 'zod'

/**
 * What this system accepts as a phone number: a Brazilian one, with its area
 * code (DDD), kept as digits only.
 *
 * The site's forms mask the field as `(21) 98765-4321`, so the punctuation is
 * dropped here rather than rejected. The same rule runs in the frontend
 * (`src/util/phone.ts` there); keep the two in step.
 */

/** The area codes (DDD) in use in Brazil, as the two digits that open the number. */
const BRAZIL_AREA_CODES = new Set(
  [
    '11 12 13 14 15 16 17 18 19',
    '21 22 24 27 28',
    '31 32 33 34 35 37 38',
    '41 42 43 44 45 46 47 48 49',
    '51 53 54 55',
    '61 62 63 64 65 66 67 68 69',
    '71 73 74 75 77 79',
    '81 82 83 84 85 86 87 88 89',
    '91 92 93 94 95 96 97 98 99',
  ]
    .join(' ')
    .split(' '),
)

const MOBILE = /^\d{2}9\d{8}$/
const LANDLINE = /^\d{2}[2-5]\d{7}$/

export const INVALID_PHONE_MESSAGE = 'Telefone inválido. Informe um número brasileiro com DDD.'

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** A mobile (DDD + 9 + 8 digits) or a landline (DDD + 8 digits starting with 2 to 5), as digits. */
export function isValidBrazilPhone(digits: string): boolean {
  return BRAZIL_AREA_CODES.has(digits.slice(0, 2)) && (MOBILE.test(digits) || LANDLINE.test(digits))
}

/** `21987654321` → `(21) 98765-4321`, `2123456789` → `(21) 2345-6789`; anything else is returned as given. */
export function formatPhone(digits: string): string {
  if (!isValidBrazilPhone(digits)) return digits
  const split = digits.length - 4
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`
}

/**
 * An optional phone in a request body. Absent or blank (`''`, or punctuation
 * only) collapses to `undefined`, so "not given" has one representation all
 * the way to the database column (`NULL`).
 */
export const optionalPhoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((digits) => digits === '' || isValidBrazilPhone(digits), { message: INVALID_PHONE_MESSAGE })
  .transform((digits) => digits || undefined)
  .optional()
