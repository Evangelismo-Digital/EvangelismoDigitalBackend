import { initSentry } from '@lib/sentry/init'

// 1. Initialize Sentry as early as possible
initSentry()

import { app } from 'app'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import closeWithGrace from 'close-with-grace'
import { crashShutdown } from '@lib/shutdown/crash-shutdown'

// Register close-with-grace for signal-based shutdowns (SIGTERM, SIGINT)
closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) {
    await crashShutdown(err, () => app.close())
  } else {
    logger.info({ signal }, `Received signal ${signal}. Server closing gracefully...`)
    await app.close()
    logger.info('✅ Server closed gracefully.')
    process.exit(0)
  }
})

// Unhandled Promise Rejections & Uncaught Exceptions
process.on('unhandledRejection', (reason) => {
  crashShutdown(reason, () => app.close())
})

process.on('uncaughtException', (error) => {
  crashShutdown(error, () => app.close())
})

async function start() {
  try {
    await app.listen({ host: '0.0.0.0', port: env.APP_PORT })
    logger.info(`Server started successfully! Listening on: ${env.APP_PORT}`)
  } catch (err) {
    await crashShutdown(err, () => app.close())
  }
}

start()
