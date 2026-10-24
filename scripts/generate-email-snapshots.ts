import fs from 'node:fs'
import path from 'node:path'

import { contactUserHtmlTemplate } from '../src/infra/mail/templates/contact-user/contact-user-html'
import { contactStaffHtmlTemplate } from '../src/infra/mail/templates/contact-staff/contact-staff-html'
import { decisionForChristStaffHtmlTemplate } from '../src/infra/mail/templates/decision-for-christ-staff/decision-for-christ-staff-html'
import { decisionForChristUserHtmlTemplate } from '../src/infra/mail/templates/decision-for-christ-user/decision-for-christ-user-html'
import { forgotPasswordHtmlTemplate } from '../src/infra/mail/templates/forgot-password/forgot-password-html'

const outDir = path.join(__dirname, '../test/fixtures/email-templates')

fs.writeFileSync(path.join(outDir, 'contact-user.html'), contactUserHtmlTemplate('Test User'))
fs.writeFileSync(
  path.join(outDir, 'contact-staff.html'),
  contactStaffHtmlTemplate('Test', 'User', 'test@example.com', '192.168.0.1'),
)
fs.writeFileSync(
  path.join(outDir, 'decision-for-christ-staff.html'),
  decisionForChristStaffHtmlTemplate('Test', 'User', 'test@example.com', '123456789', '192.168.0.1'),
)
fs.writeFileSync(path.join(outDir, 'decision-for-christ-user.html'), decisionForChristUserHtmlTemplate('Test'))
fs.writeFileSync(
  path.join(outDir, 'forgot-password.html'),
  forgotPasswordHtmlTemplate('https://example.com/reset', 'Test User'),
)

console.log('Snapshots created.')
