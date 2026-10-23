import { describe, it, expect } from 'vitest'
import { ZodValidationError } from './zod-validation-error'
import { AppError } from '@common/errors/app-error'
import { ErrorType } from '@common/types/error-type/error-type'
import { VALIDATION_ERRORS } from '@common/messages/errors/validation'

describe('ZodValidationError', () => {
  it('is an AppError of type BAD_REQUEST', () => {
    const error = new ZodValidationError({})
    expect(error).toBeInstanceOf(AppError)
    expect(error.type).toBe(ErrorType.BAD_REQUEST)
  })

  it('uses the shared ZOD_VALIDATION code and message', () => {
    const error = new ZodValidationError({})
    expect(error.body.code).toBe(VALIDATION_ERRORS.ZOD_VALIDATION.code)
    expect(error.body.message).toBe(VALIDATION_ERRORS.ZOD_VALIDATION.message)
    expect(error.message).toBe(VALIDATION_ERRORS.ZOD_VALIDATION.message)
  })

  it('carries the supplied field issues through to the body', () => {
    const issues = { email: ['Formato inválido'], name: ['Obrigatório'] }
    const error = new ZodValidationError(issues)
    expect(error.body.issues).toEqual(issues)
  })

  it('keeps the class name for serialization/telemetry', () => {
    expect(new ZodValidationError({}).name).toBe('ZodValidationError')
  })
})
