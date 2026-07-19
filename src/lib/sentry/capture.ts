import * as Sentry from '@sentry/node'
import { getRequestId, getUserId } from '@lib/logger'

/**
 * Captura de exceção "terminal/crítico" para processos sem Fastify (worker, cron,
 * filas). Espelha o captureWithRequestContext do error-handler.plugin.ts, mas sem
 * contexto de requisição HTTP. Uso restrito às falhas terminais/críticas — falhas
 * transitórias e por retry não devem passar por aqui (ver plano de logging).
 */
export function captureError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!Sentry.isInitialized()) return

  const normalized = error instanceof Error ? error : new Error(String(error))

  Sentry.withScope((scope) => {
    const userId = getUserId()
    if (userId) {
      scope.setUser({ id: userId })
    }

    scope.setContext('runtime', { requestId: getRequestId(), ...context })

    Sentry.captureException(normalized)
  })
}
