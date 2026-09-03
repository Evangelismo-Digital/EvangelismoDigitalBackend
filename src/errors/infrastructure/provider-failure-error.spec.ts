import { describe, it, expect } from 'vitest'
import { ProviderFailureError } from './provider-failure-error'
import { InfrastructureError } from '../infrastructure-error'

describe('ProviderFailureError', () => {
  it('identifies itself by name so serialization can round-trip it', () => {
    expect(new ProviderFailureError().name).toBe('ProviderFailureError')
  })

  it('is retryable, so a resilient chain advances to the next provider', () => {
    expect(new ProviderFailureError().failureMode).toBe('RETRYABLE')
  })

  it('is an InfrastructureError, so it is sanitized before reaching the client', () => {
    expect(new ProviderFailureError()).toBeInstanceOf(InfrastructureError)
  })

  it('keeps the underlying failure as both originalError and cause', () => {
    const cause = new Error('socket hang up')
    const error = new ProviderFailureError(cause)

    expect(error.originalError).toBe(cause)
    expect(error.cause).toBe(cause)
  })

  it('leaves cause unset when constructed without an underlying failure', () => {
    const error = new ProviderFailureError()

    expect(error.originalError).toBeUndefined()
    expect(error.cause).toBeUndefined()
  })
})
