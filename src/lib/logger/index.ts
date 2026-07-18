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
