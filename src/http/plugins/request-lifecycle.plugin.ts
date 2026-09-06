import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { logger, setUserId } from '@lib/logger'
import { clientIpOf } from '@http/client-ip'

/**
 * Puts the caller's id in the request context when a valid JWT is present. An
 * unauthenticated request is not an error here — the route's own guard decides
 * whether credentials were required; this hook only enriches the logs.
 */
async function populateUserId(request: FastifyRequest): Promise<void> {
  try {
    const decoded = await request.jwtVerify<{ sub: string }>()
    setUserId(decoded.sub)
  } catch {
    // Unauthenticated request — userId remains undefined
  }
}

const requestLifecyclePlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    await populateUserId(request)

    logger.info(
      {
        method: request.method,
        url: request.url,
        ip: clientIpOf(request),
        remotePort: request.socket.remotePort,
        userAgent: request.headers['user-agent'],
      },
      'Requisição recebida',
    )
  })

  app.addHook('onResponse', (request, reply, done) => {
    logger.info(
      {
        statusCode: reply.statusCode,
        method: request.method,
        url: request.url,
        requestTime: reply.elapsedTime,
      },
      'Resposta enviada',
    )

    done()
  })
}

export const requestLifecycle = fp(requestLifecyclePlugin, {
  name: 'request-lifecycle',
  dependencies: ['async-context'],
})
