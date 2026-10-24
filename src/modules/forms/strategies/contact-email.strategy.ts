import { IFormEmailStrategy } from '@modules/forms/strategies/email-strategy.interface'
import { contactUserSubjectTextTemplate } from '@infra/mail/templates/contact-user/contact-user-subject-text'
import { contactUserTextTemplate } from '@infra/mail/templates/contact-user/contact-user-text'
import { ContactUserEmail } from '@infra/mail/templates/react/contact-user'
import { contactStaffSubjectTextTemplate } from '@infra/mail/templates/contact-staff/contact-staff-subject-text'
import { contactStaffTextTemplate } from '@infra/mail/templates/contact-staff/contact-staff-text'
import { ContactStaffEmail } from '@infra/mail/templates/react/contact-staff'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { IMailJobData } from '@infra/mail/interfaces/mail-job-data.interface'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { buildStaffMailJob, buildUserMailJob, extractContactStaffData } from './form-payload-fields'
import { render } from '@react-email/render'
import React from 'react'

export class ContactEmailStrategy implements IFormEmailStrategy {
  async buildUserEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>> {
    return buildUserMailJob(form, async ({ name }) => ({
      type: 'contact',
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: await render(React.createElement(ContactUserEmail, { name })),
    }))
  }

  async buildStaffEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>> {
    const dataResult = extractContactStaffData(form)
    if (isErr(dataResult)) return dataResult

    const { email, name, lastName, ipAddress } = dataResult.value

    return ok(
      buildStaffMailJob({
        type: 'contact',
        subject: contactStaffSubjectTextTemplate(),
        message: contactStaffTextTemplate(name, email, ipAddress),
        html: await render(React.createElement(ContactStaffEmail, { name, lastName, email, ipAddress })),
      }),
    )
  }
}
