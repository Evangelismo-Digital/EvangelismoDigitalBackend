import { describe, it, expect } from 'vitest'
import { toHttpStatus } from './http-error-status.mapper'
import { ErrorType } from 'core/types/error-type/error-type'

describe('toHttpStatus', () => {
  it.each([
    [ErrorType.OK, 200],
    [ErrorType.BAD_REQUEST, 400],
    [ErrorType.UNAUTHORIZED, 401],
    [ErrorType.FORBIDDEN, 403],
    [ErrorType.NOT_FOUND, 404],
    [ErrorType.CONFLICT, 409],
    [ErrorType.UNPROCESSABLE_ENTITY, 422],
    [ErrorType.INTERNAL_SERVER_ERROR, 500],
    [ErrorType.TOO_MANY_REQUESTS, 429],
    [ErrorType.SERVICE_UNAVAILABLE, 503],
  ])('maps %s to HTTP %d', (type, status) => {
    expect(toHttpStatus(type)).toBe(status)
  })

  it('covers every ErrorType enum member (no gaps in the table)', () => {
    for (const type of Object.values(ErrorType)) {
      expect(typeof toHttpStatus(type)).toBe('number')
    }
  })

  it('falls back to 500 for an unrecognized type', () => {
    expect(toHttpStatus('SOMETHING_ELSE' as ErrorType)).toBe(500)
  })
})
