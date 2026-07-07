import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { env } from '@env/index'

const sentryPlugin: FastifyPluginAsync = async () => {
  if (!env.SENTRY_DSN) {
    return
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profileSessionSampleRate: env.SENTRY_PROFILE_SAMPLE_RATE,
    profileLifecycle: 'trace',
  })
}

export const sentry = fp(sentryPlugin, {
  name: 'sentry',
})
