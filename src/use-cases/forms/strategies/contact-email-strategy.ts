import { IFormEmailStrategy } from 'core/contracts/use-cases/forms/email-strategy.interface'
import { contactUserSubjectTextTemplate } from '@templates/contact-user/contact-user-subject-text'
import { contactUserTextTemplate } from '@templates/contact-user/contact-user-text'
import { contactUserHtmlTemplate } from '@templates/contact-user/contact-user-html'
import { contactStaffSubjectTextTemplate } from '@templates/contact-staff/contact-staff-subject-text'
import { contactStaffTextTemplate } from '@templates/contact-staff/contact-staff-text'
import { contactStaffHtmlTemplate } from '@templates/contact-staff/contact-staff-html'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { env } from '@env/index'
import { optionalIpAddress, optionalStringField, requireSubmitterIdentity } from './form-payload-fields'

export class ContactEmailStrategy implements IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const identityResult = requireSubmitterIdentity(form)
    if (isErr(identityResult)) return identityResult

    const { email, name } = identityResult.value

    return ok({
      to: email,
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: contactUserHtmlTemplate(name),
      context: { type: 'contact', recipient: 'user' },
    })
  }

  buildStaffEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const identityResult = requireSubmitterIdentity(form)
    if (isErr(identityResult)) return identityResult

    const lastNameResult = optionalStringField(form.lastName, 'form.lastName')
    if (isErr(lastNameResult)) return lastNameResult

    const { email, name } = identityResult.value
    const lastName = lastNameResult.value
    const ipAddress = optionalIpAddress(form)

    return ok({
      to: env.ADMIN_EMAIL,
      subject: contactStaffSubjectTextTemplate(),
      message: contactStaffTextTemplate(name, email, ipAddress),
      html: contactStaffHtmlTemplate(name, lastName, email, ipAddress),
      context: { type: 'contact', recipient: 'internal' },
    })
  }
}
