import { IFormEmailStrategy } from 'core/contracts/use-cases/forms/email-strategy.interface'
import { decisionForChristUserSubjectText } from '@templates/decision-for-christ-user/decision-for-christ-user-subject-text'
import { decisionForChristUserTextTemplate } from '@templates/decision-for-christ-user/decision-for-christ-user-text'
import { decisionForChristUserHtmlTemplate } from '@templates/decision-for-christ-user/decision-for-christ-user-html'
import { decisionForChristStaffSubjectText } from '@templates/decision-for-christ-staff/decision-for-christ-staff-subject-text'
import { decisionForChristStaffTextTemplate } from '@templates/decision-for-christ-staff/decision-for-christ-staff-text'
import { decisionForChristStaffHtmlTemplate } from '@templates/decision-for-christ-staff/decision-for-christ-staff-html'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { IMailJobData } from 'core/contracts/lib/queue/mail-job-data.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { env } from '@env/index'
import {
  optionalIpAddress,
  optionalStringField,
  requireStringField,
  requireSubmitterIdentity,
} from './form-payload-fields'

export class DecisionForChristEmailStrategy implements IFormEmailStrategy {
  buildUserEmail(form: FormPayload): Result<IMailJobData, AppError> {
    const identityResult = requireSubmitterIdentity(form)
    if (isErr(identityResult)) return identityResult

    const { email, name } = identityResult.value

    return ok({
      to: email,
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: decisionForChristUserHtmlTemplate(name),
      context: { type: 'decision-for-Christ', recipient: 'user' },
    })
  }

  buildStaffEmail(form: FormPayload): Result<IMailJobData, AppError> {
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

    return ok({
      to: env.ADMIN_EMAIL,
      subject: decisionForChristStaffSubjectText(),
      message: decisionForChristStaffTextTemplate(name, email, ipAddress),
      html: decisionForChristStaffHtmlTemplate(name, lastName, email, location, ipAddress),
      context: { type: 'decision-for-Christ', recipient: 'internal' },
    })
  }
}
