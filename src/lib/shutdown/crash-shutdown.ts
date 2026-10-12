import { captureException, flush } from '@sentry/node'
import { logger } from '@lib/logger'

/** Losing the Sentry report is better than not exiting; keep the wait short. */
const SENTRY_FLUSH_TIMEOUT_MS = 2_000

export async function crashShutdown(error: unknown): Promise<void> {
  logger.fatal({ err: error }, 'Travamento não tratado detectado, iniciando sequência de encerramento por falha...')
  await reportToSentry(error)
}

/** Also best-effort: losing the Sentry report is better than not exiting. */
async function reportToSentry(error: unknown): Promise<void> {
  try {
    captureException(error instanceof Error ? error : new Error(String(error)))
    await flush(SENTRY_FLUSH_TIMEOUT_MS)
    logger.info('Logs do Sentry enviados com sucesso.')
  } catch (sentryError) {
    logger.error({ err: sentryError }, 'Erro ao enviar os logs do Sentry durante o encerramento por travamento')
  }
}
