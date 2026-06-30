import { IFormEmailStrategy } from 'core/contracts/use-cases/forms/email-strategy.interface'
import { contactUserSubjectTextTemplate } from '@templates/contact-user/contact-user-subject-text'
import { contactUserTextTemplate } from '@templates/contact-user/contact-user-text'
import { contactUserHtmlTemplate } from '@templates/contact-user/contact-user-html'
import { contactStaffSubjectTextTemplate } from '@templates/contact-staff/contact-staff-subject-text'
import { contactStaffTextTemplate } from '@templates/contact-staff/contact-staff-text'
import { contactStaffHtmlTemplate } from '@templates/contact-staff/contact-staff-html'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'
import { env } from '@env/index'

export class ContactEmailStrategy implements IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const emailResult = this.getStringField(form.email, 'form.email')
    if (isErr(emailResult)) return emailResult

    const nameResult = this.getStringField(form.name, 'form.name')
    if (isErr(nameResult)) return nameResult

    const email = emailResult.value
    const name = nameResult.value

    return ok({
      to: email,
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: contactUserHtmlTemplate(name),
      context: { type: 'contact', recipient: 'user' },
    })
  }

  buildStaffEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const emailResult = this.getStringField(form.email, 'form.email')
    if (isErr(emailResult)) return emailResult

    const nameResult = this.getStringField(form.name, 'form.name')
    if (isErr(nameResult)) return nameResult

    const lastNameResult = this.getOptionalStringField(form.lastName, 'form.lastName')
    if (isErr(lastNameResult)) return lastNameResult

    const email = emailResult.value
    const name = nameResult.value
    const lastName = lastNameResult.value

    return ok({
      to: env.ADMIN_EMAIL,
      subject: contactStaffSubjectTextTemplate(),
      message: contactStaffTextTemplate(name, email),
      html: contactStaffHtmlTemplate(name, lastName, email),
      context: { type: 'contact', recipient: 'internal' },
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
