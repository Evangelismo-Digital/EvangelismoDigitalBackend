import * as Sentry from '@sentry/node'
import { logger } from '@lib/logger'

let isShuttingDown = false

export async function crashShutdown(error: unknown, cleanup: () => Promise<void> | void): Promise<never> {
  if (isShuttingDown) {
    process.exit(1)
    return undefined as never
  }

  isShuttingDown = true

  logger.fatal({ err: error }, 'Travamento não tratado detectado, iniciando sequência de encerramento por falha...')

  // Force exit after 15 seconds if cleanup hangs
  const hardTimeout = setTimeout(() => {
    logger.fatal('O tempo limite de limpeza para encerramento expirou após 15s. Forçando a saída.')
    process.exit(1)
  }, 15_000)

  // Allow the process to exit even if the timeout hasn't fired yet
  hardTimeout.unref()

  await runCleanup(cleanup)

  try {
    await reportToSentry(error)
  } finally {
    clearTimeout(hardTimeout)
    process.exit(1)
  }
}

/** Best-effort: a failing cleanup must never stop the process from exiting. */
async function runCleanup(cleanup: () => Promise<void> | void): Promise<void> {
  try {
    await cleanup()
    logger.info('Limpeza de encerramento por travamento concluída com sucesso.')
  } catch (cleanupError) {
    logger.error({ err: cleanupError }, 'Ocorreu um erro durante a limpeza de encerramento por travamento')
  }
}

/** Also best-effort: losing the Sentry report is better than not exiting. */
async function reportToSentry(error: unknown): Promise<void> {
  try {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    await Sentry.flush(2000)
    logger.info('Logs do Sentry enviados com sucesso.')
  } catch (sentryError) {
    logger.error({ err: sentryError }, 'Erro ao enviar os logs do Sentry durante o encerramento por travamento')
  }
}
