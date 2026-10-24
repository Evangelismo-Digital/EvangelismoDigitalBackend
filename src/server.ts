import { initSentry } from '@infra/sentry/init'

// 1. Initialize Sentry as early as possible
initSentry()

import { app } from 'app'
import { env } from '@config/env/index'
import { logger } from '@infra/logger'
import { captureError } from '@infra/sentry/capture'
import closeWithGrace from 'close-with-grace'
import { crashShutdown } from '@infra/shutdown/crash-shutdown'
import { startMetricsServer, stopMetricsServer } from './metrics-server'

// Close the main app first (drains in-flight requests, tears down Redis via
// app's onClose hook), then the metrics server LAST so telemetry stays
// scrapeable through the rest of shutdown. stopMetricsServer is a safe no-op
// when metrics are disabled or never started.
async function shutdown() {
  await app.close()
  await stopMetricsServer()
}

closeWithGrace(
  {
    delay: 15_000,
    onTimeout: () => {
      logger.fatal('O tempo limite de limpeza para encerramento expirou após 15s. Forçando a saída.')
    },
  },
  async ({ signal, err }) => {
    if (err) {
      try {
        await shutdown()
        logger.info('Limpeza de encerramento por travamento concluída com sucesso.')
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, 'Ocorreu um erro durante a limpeza de encerramento por travamento')
      }
      await crashShutdown(err)
    } else {
      // \`signal\` is undefined when the shutdown was triggered programmatically
      // rather than by a signal, and \`\${undefined}\` would print the word.
      logger.info({ signal }, `Sinal ${signal ?? 'desconhecido'} recebido. Encerrando o servidor graciosamente...`)
      await shutdown()
      logger.info('Servidor encerrado graciosamente.')
    }
  },
)

async function start() {
  try {
    await app.listen({ host: '0.0.0.0', port: env.APP_PORT })
    logger.info(`Servidor iniciado com sucesso! Escutando na porta: ${env.APP_PORT}`)

    // Metrics server is auxiliary: a bind failure must not take down the API.
    try {
      await startMetricsServer({ port: env.METRICS_API_PORT })
    } catch (metricsErr) {
      logger.error({ err: metricsErr }, 'Falha ao iniciar o servidor de métricas; a API continuará sem métricas')
      captureError(metricsErr)
    }
  } catch (err) {
    await crashShutdown(err)
  }
}

void start()
