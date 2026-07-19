import pino, { multistream, StreamEntry, type LoggerOptions } from 'pino'
import { env } from '@env/index'
import { asyncLocalStorage } from '@lib/async-local-storage'

export function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId
}

export function getUserId() {
  return asyncLocalStorage.getStore()?.userId
}

export function setUserId(userId: string) {
  const store = asyncLocalStorage.getStore()
  if (store) {
    store.userId = userId
  }
}

const isDev = env.NODE_ENV === 'development'

type SerializableError = Error & {
  code?: string
  body?: { code?: string }
  type?: string
  failureMode?: string
}

/**
 * Dev mantém o stack completo (pino.stdSerializers.err). Fora do dev, reduzimos
 * para campos buscáveis/baratos de armazenar — apenas as 6 primeiras linhas do
 * stack (breadcrumb), já que o stack completo fica no Sentry (@lib/sentry/capture).
 * Evita gravar o payload verboso em todo log de erro de um processo de longa duração.
 */
export function errSerializer(err: unknown) {
  if (!(err instanceof Error)) return err

  if (isDev) return pino.stdSerializers.err(err)

  const error = err as SerializableError
  return {
    name: error.name,
    message: error.message,
    code: error.body?.code ?? error.code,
    type: error.type,
    failureMode: error.failureMode,
    stack: error.stack?.split('\n').slice(0, 6).join('\n'),
  }
}

const baseConfig: LoggerOptions = {
  level: env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label }
    },
  },
  mixin() {
    return { requestId: getRequestId(), userId: getUserId() }
  },
  serializers: {
    err: errSerializer,
    error: errSerializer,
    cause: errSerializer,
  },
}

const prodStreams: StreamEntry[] = [
  { level: 'info', stream: process.stdout },
  { level: 'error', stream: process.stderr },
]

const loggerConfig: LoggerOptions = isDev
  ? {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    }
  : baseConfig

export const logger = isDev ? pino(loggerConfig) : pino(baseConfig, multistream(prodStreams))
