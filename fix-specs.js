const fs = require('fs')

const files = [
  'src/use-cases/forms/strategies/contact-email-strategy.spec.ts',
  'src/use-cases/forms/strategies/decision-for-christ-email-strategy.spec.ts'
]

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8')
  content = content.replace(/strategy\.buildUserEmail/g, 'await strategy.buildUserEmail')
  content = content.replace(/strategy\.buildStaffEmail/g, 'await strategy.buildStaffEmail')
  content = content.replace(/it\('/g, "it('async ")
  content = content.replace(/, \(\) => {/g, ', async () => {')
  fs.writeFileSync(file, content)
}
