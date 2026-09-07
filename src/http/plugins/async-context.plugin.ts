import { asyncLocalStorage } from '@lib/async-local-storage'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

const asyncContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', (request, _reply, done) => {
    const requestId = request.id

    const requestInfo = {
      host: request.host,
      protocol: request.protocol,
      userAgent: request.headers['user-agent'] || '',
    }

    asyncLocalStorage.run(
      {
        requestId,
        requestInfo,
      },
      done,
    )
  })
}

export const asyncContext = fp(asyncContextPlugin, {
  name: 'async-context',
})
