import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { Result, ok, err, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { InvalidFormPayloadError } from '@modules/forms/errors/invalid-form-payload-error'
import { IMailJobData } from '@infra/mail/interfaces/mail-job-data.interface'
import { env } from '@config/env/index'

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

export interface UserMailJobContent {
  type: string
  subject: string
  message: string
  html: string
}

export async function buildUserMailJob(
  form: FormPayload,
  buildContent: (identity: SubmitterIdentity) => Promise<UserMailJobContent> | UserMailJobContent,
): Promise<Result<IMailJobData, AppError>> {
  const identityResult = requireSubmitterIdentity(form)
  if (isErr(identityResult)) return identityResult

  const { email, name } = identityResult.value
  const { type, subject, message, html } = await buildContent({ email, name })

  return ok({
    subject,
    message,
    html,
    to: email,
    context: { type, recipient: 'user' },
  })
}

export interface StaffMailJobContent {
  type: string
  subject: string
  message: string
  html: string
}

export function buildStaffMailJob(content: StaffMailJobContent): IMailJobData {
  return {
    to: env.ADMIN_EMAIL,
    subject: content.subject,
    message: content.message,
    html: content.html,
    context: { type: content.type, recipient: 'internal' },
  }
}

export interface ContactStaffData extends SubmitterIdentity {
  lastName: string
  ipAddress?: string
}

export function extractContactStaffData(form: FormPayload): Result<ContactStaffData, AppError> {
  const identityResult = requireSubmitterIdentity(form)
  if (isErr(identityResult)) return identityResult

  const lastNameResult = optionalStringField(form.lastName, 'form.lastName')
  if (isErr(lastNameResult)) return lastNameResult

  return ok({
    ...identityResult.value,
    lastName: lastNameResult.value,
    ipAddress: optionalIpAddress(form),
  })
}
