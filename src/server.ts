import { initSentry } from '@lib/sentry/init'

// 1. Initialize Sentry as early as possible
initSentry()

import { app } from 'app'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import closeWithGrace from 'close-with-grace'
import { crashShutdown } from '@lib/shutdown/crash-shutdown'
import { startMetricsServer, stopMetricsServer } from './metrics-server'

// Close the main app first (drains in-flight requests, tears down Redis via
// app's onClose hook), then the metrics server LAST so telemetry stays
// scrapeable through the rest of shutdown. stopMetricsServer is a safe no-op
// when metrics are disabled or never started.
async function shutdown() {
  await app.close()
  await stopMetricsServer()
}

// Register close-with-grace for signal-based shutdowns (SIGTERM, SIGINT)
closeWithGrace({ delay: 10000 }, async ({ signal, err }) => {
  if (err) {
    await crashShutdown(err, shutdown)
  } else {
    // `signal` is undefined when the shutdown was triggered programmatically
    // rather than by a signal, and `${undefined}` would print the word.
    logger.info({ signal }, `Sinal ${signal ?? 'desconhecido'} recebido. Encerrando o servidor graciosamente...`)
    await shutdown()
    logger.info('Servidor encerrado graciosamente.')
    process.exit(0)
  }
})

// Unhandled Promise Rejections & Uncaught Exceptions
//
// `void` rather than `await`: these handlers are synchronous by contract, and
// crashShutdown never rejects — it swallows both cleanup and Sentry failures
// and always ends in process.exit(1). Marking the discard explicit is the point;
// a bare call reads as an oversight.
process.on('unhandledRejection', (reason) => {
  void crashShutdown(reason, shutdown)
})

process.on('uncaughtException', (error) => {
  void crashShutdown(error, shutdown)
})

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
    await crashShutdown(err, shutdown)
  }
}

void start()
