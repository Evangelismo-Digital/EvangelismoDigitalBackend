import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'

/**
 * Reading typed fields out of an untyped form payload.
 *
 * `FormPayload` is a recursive JSON type, so every field arrives as `unknown`
 * and each strategy has to narrow it before use. Both e-mail strategies carried
 * their own byte-identical copies of these helpers — 26 duplicated lines that a
 * copy-paste detector flags and a reader never notices, because the two files
 * are rarely open at the same time. The hazard is the ordinary one: a fix to
 * the validation in one strategy silently not applying to the other.
 */

/** A field that must be present and a string, or the payload is invalid. */
export function requireStringField(value: unknown, fieldName: string): Result<string, AppError> {
  if (typeof value === 'string') {
    return ok(value)
  }

  return err(new InvalidFormPayloadError(fieldName))
}

/**
 * A field that may be absent, but must be a string if present.
 *
 * Absent collapses to `''` rather than `undefined` because every consumer is a
 * template that interpolates it.
 */
export function optionalStringField(value: unknown, fieldName: string): Result<string, AppError> {
  if (value === undefined || typeof value === 'string') {
    return ok((value as string) || '')
  }

  return err(new InvalidFormPayloadError(fieldName))
}

/**
 * The submitter's IP, when the payload carries one.
 *
 * Never a failure: the address is diagnostic metadata added by the HTTP layer,
 * and a form is still perfectly valid without it.
 */
export function optionalIpAddress(form: FormPayload): string | undefined {
  return typeof form.ipAddress === 'string' ? form.ipAddress : undefined
}

/** The two fields every form must carry, whoever the e-mail is addressed to. */
export interface SubmitterIdentity {
  email: string
  name: string
}

export function requireSubmitterIdentity(form: FormPayload): Result<SubmitterIdentity, AppError> {
  const emailResult = requireStringField(form.email, 'form.email')
  if (isErr(emailResult)) return emailResult

  const nameResult = requireStringField(form.name, 'form.name')
  if (isErr(nameResult)) return nameResult

  return ok({ email: emailResult.value, name: nameResult.value })
}
