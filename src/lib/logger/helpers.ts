import { logger } from './index'

export function logError(error: unknown, context: Record<string, unknown> = {}, msg = 'Erro inesperado') {
  if (error instanceof Error) {
    logger.error(
      {
        message: error.message,
        stack: error.stack,
        ...context,
      },
      msg,
    )
  } else {
    logger.error(
      {
        message: 'Erro desconhecido',
        ...context,
      },
      msg,
    )
  }
}
