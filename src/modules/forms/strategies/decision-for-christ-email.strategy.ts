import { IFormEmailStrategy } from '@modules/forms/strategies/email-strategy.interface'
import { decisionForChristUserSubjectText } from '@infra/mail/templates/decision-for-christ-user/decision-for-christ-user-subject-text'
import { decisionForChristUserTextTemplate } from '@infra/mail/templates/decision-for-christ-user/decision-for-christ-user-text'
import { DecisionForChristUserEmail } from '@infra/mail/templates/react/decision-for-christ-user'
import { decisionForChristStaffSubjectText } from '@infra/mail/templates/decision-for-christ-staff/decision-for-christ-staff-subject-text'
import { decisionForChristStaffTextTemplate } from '@infra/mail/templates/decision-for-christ-staff/decision-for-christ-staff-text'
import { DecisionForChristStaffEmail } from '@infra/mail/templates/react/decision-for-christ-staff'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { IMailJobData } from '@infra/mail/interfaces/mail-job-data.interface'
import { Result, ok, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import {
  buildStaffMailJob,
  buildUserMailJob,
  optionalIpAddress,
  optionalStringField,
  requireStringField,
  requireSubmitterIdentity,
} from './form-payload-fields'
import { render } from '@react-email/render'
import React from 'react'

export class DecisionForChristEmailStrategy implements IFormEmailStrategy {
  async buildUserEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>> {
    return buildUserMailJob(form, async ({ name }) => ({
      type: 'decision-for-Christ',
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: await render(React.createElement(DecisionForChristUserEmail, { name })),
    }))
  }

  async buildStaffEmail(form: FormPayload): Promise<Result<IMailJobData, AppError>> {
    const identityResult = requireSubmitterIdentity(form)
    if (isErr(identityResult)) return identityResult

    // Required here, unlike the contact form: the staff notification for a
    // decision names the person in full.
    const lastNameResult = requireStringField(form.lastName, 'form.lastName')
    if (isErr(lastNameResult)) return lastNameResult

    const locationResult = optionalStringField(form.location, 'form.location')
    if (isErr(locationResult)) return locationResult

    const { email, name } = identityResult.value
    const lastName = lastNameResult.value
    const location = locationResult.value
    const ipAddress = optionalIpAddress(form)

    return ok(
      buildStaffMailJob({
        type: 'decision-for-Christ',
        subject: decisionForChristStaffSubjectText(),
        message: decisionForChristStaffTextTemplate(name, email, ipAddress),
        html: await render(
          React.createElement(DecisionForChristStaffEmail, { name, lastName, email, location, ipAddress }),
        ),
      }),
    )
  }
}
