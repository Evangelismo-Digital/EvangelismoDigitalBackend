import { describe, it, expect } from 'vitest'
import { formsSchema } from './forms.dto'

const VALID = { name: 'Maria', lastName: 'Silva', email: 'Maria@Example.com', decisaoPorCristo: false }

describe('formsSchema phone', () => {
  it('accepts a form without a phone', () => {
    expect(formsSchema.parse(VALID).phone).toBeUndefined()
  })

  it('keeps a masked phone as digits', () => {
    expect(formsSchema.parse({ ...VALID, phone: '(21) 98765-4321' }).phone).toBe('21987654321')
  })

  it('treats a blank phone as not given', () => {
    expect(formsSchema.parse({ ...VALID, phone: '' }).phone).toBeUndefined()
  })

  it('rejects an invalid phone on the phone field', () => {
    const result = formsSchema.safeParse({ ...VALID, phone: '1234' })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['phone']])
  })
})
