import { IFormEmailStrategy } from 'core/contracts/use-cases/forms/email-strategy.interface'
import { decisionForChristUserSubjectText } from '@templates/decision-for-christ-user/decision-for-christ-user-subject-text'
import { decisionForChristUserTextTemplate } from '@templates/decision-for-christ-user/decision-for-christ-user-text'
import { decisionForChristUserHtmlTemplate } from '@templates/decision-for-christ-user/decision-for-christ-user-html'
import { decisionForChristStaffSubjectText } from '@templates/decision-for-christ-staff/decision-for-christ-staff-subject-text'
import { decisionForChristStaffTextTemplate } from '@templates/decision-for-christ-staff/decision-for-christ-staff-text'
import { decisionForChristStaffHtmlTemplate } from '@templates/decision-for-christ-staff/decision-for-christ-staff-html'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'
import { env } from '@env/index'

export class DecisionForChristEmailStrategy implements IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const emailResult = this.getStringField(form.email, 'form.email')
    if (isErr(emailResult)) return emailResult

    const nameResult = this.getStringField(form.name, 'form.name')
    if (isErr(nameResult)) return nameResult

    const email = emailResult.value
    const name = nameResult.value

    return ok({
      to: email,
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: decisionForChristUserHtmlTemplate(name),
      context: { type: 'decision-for-Christ', recipient: 'user' },
    })
  }

  buildStaffEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const emailResult = this.getStringField(form.email, 'form.email')
    if (isErr(emailResult)) return emailResult

    const nameResult = this.getStringField(form.name, 'form.name')
    if (isErr(nameResult)) return nameResult

    const lastNameResult = this.getStringField(form.lastName, 'form.lastName')
    if (isErr(lastNameResult)) return lastNameResult

    const locationResult = this.getOptionalStringField(form.location, 'form.location')
    if (isErr(locationResult)) return locationResult

    const email = emailResult.value
    const name = nameResult.value
    const lastName = lastNameResult.value
    const location = locationResult.value
    const ipAddress = typeof form.ipAddress === 'string' ? form.ipAddress : undefined

    return ok({
      to: env.ADMIN_EMAIL,
      subject: decisionForChristStaffSubjectText(),
      message: decisionForChristStaffTextTemplate(name, email, ipAddress),
      html: decisionForChristStaffHtmlTemplate(name, lastName, email, location, ipAddress),
      context: { type: 'decision-for-Christ', recipient: 'internal' },
    })
  }

  private getStringField(value: unknown, fieldName: string): Result<string, AppError> {
    if (typeof value === 'string') {
      return ok(value)
    }
    return err(new InvalidFormPayloadError(fieldName))
  }

  private getOptionalStringField(value: unknown, fieldName: string): Result<string, AppError> {
    if (value === undefined || typeof value === 'string') {
      return ok((value as string) || '')
    }
    return err(new InvalidFormPayloadError(fieldName))
  }
}
