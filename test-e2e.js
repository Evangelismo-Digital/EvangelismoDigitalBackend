import { execSync } from 'child_process'
console.log(execSync('npx vitest run src/http/controllers/analytics/analytics.e2e.spec.ts', { stdio: 'pipe' }).toString())
