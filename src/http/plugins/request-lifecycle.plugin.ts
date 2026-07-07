import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { logger, setUserId } from '@lib/logger'

const requestLifecyclePlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    const xff = request.headers['x-forwarded-for']
    const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(',')[0].trim() || request.ip

    try {
      const decoded = await request.jwtVerify<{ sub: string }>()
      setUserId(decoded.sub)
    } catch {
      // Unauthenticated request — userId remains undefined
    }

    logger.info(
      {
        method: request.method,
        url: request.url,
        ip: clientIp,
        remotePort: request.socket.remotePort,
        userAgent: request.headers['user-agent'],
      },
      'Incoming request',
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
      'Response sent',
    )

    done()
  })
}

export const requestLifecycle = fp(requestLifecyclePlugin, {
  name: 'request-lifecycle',
  dependencies: ['async-context'],
})
