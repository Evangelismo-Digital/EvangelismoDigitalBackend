import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import '@fastify/cookie'
import { randomUUID } from 'node:crypto'
import { env } from '@env/index'
import { logger } from '@lib/logger'


declare module 'fastify' {
  interface FastifyRequest {
    visitorId: string
    sessionId: string
  }
}

const analyticsPlugin: FastifyPluginAsync = async (app) => {
  // 1. Cookie Extraction and Generation on Request
  app.addHook('onRequest', async (request, reply) => {
    try {
      let visitorId: string | null = null
      const visitorCookie = request.cookies['visitor_id']
      
      if (visitorCookie) {
        const unsigned = request.unsignCookie(visitorCookie)
        if (unsigned.valid && unsigned.value) {
          visitorId = unsigned.value
        }
      }

      if (!visitorId) {
        visitorId = randomUUID()
        reply.setCookie('visitor_id', visitorId, {
          path: '/',
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          signed: true,
          maxAge: 365 * 24 * 60 * 60, // 1 year in seconds
        })
      }

      let sessionId: string | null = null
      const sessionCookie = request.cookies['session_id']
      
      if (sessionCookie) {
        const unsigned = request.unsignCookie(sessionCookie)
        if (unsigned.valid && unsigned.value) {
          sessionId = unsigned.value
        }
      }

      if (!sessionId) {
        sessionId = randomUUID()
        reply.setCookie('session_id', sessionId, {
          path: '/',
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          signed: true,
          // session-scoped (expires when browser is closed)
        })
      }

      request.visitorId = visitorId
      request.sessionId = sessionId
    } catch (error) {
      logger.warn(error, 'Erro não crítico ao extrair/definir cookies de analytics, prosseguindo com IDs temporários')
      request.visitorId = request.visitorId || randomUUID()
      request.sessionId = request.sessionId || randomUUID()
    }
  })
}

export const analytics = fp(analyticsPlugin, {
  name: 'analytics',
  dependencies: ['async-context'],
})
