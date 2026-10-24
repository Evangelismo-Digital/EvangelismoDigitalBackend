import { describe, expect, it, vi } from 'vitest'
import { errSerializer } from './index'

describe('logger serializers', () => {
  it('should preserve properties for non-errors', () => {
    expect(errSerializer('string error')).toBe('string error')
    expect(errSerializer({ foo: 'bar' })).toEqual({ foo: 'bar' })
  })

  it('formats stack traces joining with newline and keeps specific fields', () => {
    const err = new Error('Test')
    err.stack = 'Error: Test\n    at Object.<anonymous> (/file.js:1:1)\n    at Module._compile (/module.js:1:1)'
    // @ts-ignore
    err.code = 'SOME_CODE'
    // @ts-ignore
    err.type = 'SOME_TYPE'
    // @ts-ignore
    err.failureMode = 'RETRYABLE'

    const serializedErr = errSerializer(err) as any

    expect(serializedErr.name).toBe('Error')
    expect(serializedErr.message).toBe('Test')
    expect(serializedErr.code).toBe('SOME_CODE')
    expect(serializedErr.type).toBe('SOME_TYPE')
    expect(serializedErr.failureMode).toBe('RETRYABLE')
    expect(serializedErr.stack).toContain('Error: Test\n    at Object.<anonymous>')
  })

  it('prioritizes err.body.code over err.code', () => {
    const err = new Error('Test')
    // @ts-ignore
    err.code = 'SOME_CODE'
    // @ts-ignore
    err.body = { code: 'BODY_CODE' }

    const serializedErr = errSerializer(err) as any

    expect(serializedErr.code).toBe('BODY_CODE')
  })
})
