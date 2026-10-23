import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import fc from 'fast-check'
import { hashResetToken } from './token-hash'

describe('hashResetToken', () => {
  it('produces the SHA-256 hex digest of the raw token', () => {
    const raw = 'my-secret-token'
    const expected = createHash('sha256').update(raw).digest('hex')
    expect(hashResetToken(raw)).toBe(expected)
  })

  it('returns a 64-character lowercase hex string', () => {
    const hash = hashResetToken('abc')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashResetToken('token-123')).toBe(hashResetToken('token-123'))
  })

  it('never returns the raw token (no plaintext leak)', () => {
    const raw = 'plaintext-token-value'
    expect(hashResetToken(raw)).not.toContain(raw)
  })

  it('maps distinct inputs to distinct digests and matches Node crypto (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(hashResetToken(a)).toBe(createHash('sha256').update(a).digest('hex'))
        if (a !== b) {
          expect(hashResetToken(a)).not.toBe(hashResetToken(b))
        }
      }),
    )
  })
})
