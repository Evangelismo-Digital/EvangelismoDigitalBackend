import * as Sentry from '@sentry/node'
import { logger } from '@lib/logger'

let isShuttingDown = false

export async function crashShutdown(
  error: unknown,
  cleanup: () => Promise<void> | void,
): Promise<never> {
  if (isShuttingDown) {
    process.exit(1)
    return undefined as never
  }

  isShuttingDown = true

  logger.fatal({ err: error }, '🔥 Unhandled crash detected, initiating crash shutdown sequence...')

  // Force exit after 15 seconds if cleanup hangs
  const hardTimeout = setTimeout(() => {
    logger.fatal('❌ Crash shutdown cleanup timed out after 15s. Force exiting.')
    process.exit(1)
  }, 15_000)

  // Allow the process to exit even if the timeout hasn't fired yet
  hardTimeout.unref()

  try {
    await cleanup()
    logger.info('✅ Crash shutdown cleanup completed successfully.')
  } catch (cleanupError) {
    logger.error({ err: cleanupError }, '❌ Error occurred during crash shutdown cleanup')
  }

  try {
    if (error instanceof Error) {
      Sentry.captureException(error)
    } else {
      Sentry.captureException(new Error(String(error)))
    }
    await Sentry.flush(2000)
    logger.info('✅ Sentry flushed successfully.')
  } catch (sentryError) {
    logger.error({ err: sentryError }, '❌ Error flushing Sentry during crash shutdown')
  } finally {
    clearTimeout(hardTimeout)
    process.exit(1)
  }
}
