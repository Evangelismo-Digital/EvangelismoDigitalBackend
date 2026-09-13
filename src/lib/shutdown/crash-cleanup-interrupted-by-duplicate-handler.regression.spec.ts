import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

describe('Defect A1: crash cleanup interrupted by duplicate handler', () => {
  it('should complete cleanup before exiting on an uncaught exception', () => {
    // We create a script that mimics the old and new behavior.
    // Actually, we can test the new closeWithGrace behavior vs the old one.
    const scriptPath = path.join(__dirname, 'temp-test-script-1.ts')
    const scriptContent = `
import closeWithGrace from 'close-with-grace'

let cleanupStarted = false
let cleanupFinished = false

async function shutdown() {
  cleanupStarted = true
  await new Promise((resolve) => setTimeout(resolve, 500))
  cleanupFinished = true
  console.log('CLEANUP_FINISHED')
}

// NEW BEHAVIOR
closeWithGrace({ delay: 1000 }, async ({ err }) => {
  if (err) {
    await shutdown()
  }
})

// OLD BEHAVIOR (commented out in fix, but if present, would interrupt cleanup):
// process.on('uncaughtException', (err) => {
//   if (cleanupStarted) {
//     process.exit(1) // simulates isShuttingDown = true -> process.exit(1)
//   }
// })

setTimeout(() => {
  throw new Error('Test Error')
}, 100)
    `
    fs.writeFileSync(scriptPath, scriptContent)

    try {
      const output = execSync(`npx tsx ${scriptPath}`, { encoding: 'utf-8', stdio: 'pipe' })
      expect(output).toContain('CLEANUP_FINISHED')
    } catch (err: any) {
      expect(err.stdout).toContain('CLEANUP_FINISHED')
    } finally {
      fs.unlinkSync(scriptPath)
    }
  })

  it('counterweight: a second crash during shutdown should still force exit', () => {
    const scriptPath = path.join(__dirname, 'temp-test-script-2.ts')
    const scriptContent = `
import closeWithGrace from 'close-with-grace'

async function shutdown() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  console.log('CLEANUP_FINISHED') // Should not be reached
}

closeWithGrace({ delay: 2000 }, async ({ err }) => {
  if (err) {
    setTimeout(() => {
      console.log('SECOND_CRASH')
      throw new Error('Second Error')
    }, 100)
    await shutdown()
  }
})

setTimeout(() => {
  throw new Error('First Error')
}, 100)
    `
    fs.writeFileSync(scriptPath, scriptContent)

    try {
      execSync(`npx tsx ${scriptPath}`, { encoding: 'utf-8', stdio: 'pipe' })
    } catch (err: any) {
      expect(err.stdout).not.toContain('CLEANUP_FINISHED')
      expect(err.stdout).toContain('SECOND_CRASH')
    } finally {
      fs.unlinkSync(scriptPath)
    }
  })
})
