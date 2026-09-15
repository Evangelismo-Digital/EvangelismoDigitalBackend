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
import { buildStaffMailJob, buildUserMailJob, extractContactStaffData } from './form-payload-fields'

export class ContactEmailStrategy implements IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Result<IMailJobData, AppError> {
    return buildUserMailJob(form, ({ name }) => ({
      type: 'contact',
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: contactUserHtmlTemplate(name),
    }))
  }

  buildStaffEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const dataResult = extractContactStaffData(form)
    if (isErr(dataResult)) return dataResult

    const { email, name, lastName, ipAddress } = dataResult.value

    return ok(
      buildStaffMailJob({
        type: 'contact',
        subject: contactStaffSubjectTextTemplate(),
        message: contactStaffTextTemplate(name, email, ipAddress),
        html: contactStaffHtmlTemplate(name, lastName, email, ipAddress),
      }),
    )
  }
}
