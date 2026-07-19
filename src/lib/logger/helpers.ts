import { logger } from './index'

interface LogErrorOptions {
  level?: 'error' | 'warn' | 'fatal'
}

export function logError(
  error: unknown,
  context: Record<string, unknown> = {},
  msg = 'Erro inesperado',
  options: LogErrorOptions = {},
) {
  const level = options.level ?? 'error'
  logger[level]({ err: error, ...context }, msg)
}
