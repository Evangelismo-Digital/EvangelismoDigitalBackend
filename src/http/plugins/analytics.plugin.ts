import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import '@fastify/cookie'
import { randomUUID } from 'node:crypto'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { DAYS_PER_YEAR, SECONDS_PER_DAY } from 'core/constants/time'

declare module 'fastify' {
  interface FastifyRequest {
    visitorId: string
    sessionId: string
  }
}

/** One year, in seconds — the visitor cookie outlives the browser session. */
const VISITOR_COOKIE_MAX_AGE = SECONDS_PER_DAY * DAYS_PER_YEAR

const TRACKING_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  signed: true,
} as const

/**
 * Returns the id carried by a signed cookie, minting and setting a fresh one
 * when the cookie is missing, unsigned or tampered with.
 *
 * The visitor and session cookies differ only in name and lifetime, and were
 * previously handled by two copies of the same block — so a fix to one could
 * silently miss the other.
 */
function resolveTrackingCookie(request: FastifyRequest, reply: FastifyReply, name: string, maxAge?: number): string {
  const existing = readSignedCookie(request, name)

  if (existing) {
    return existing
  }

  const minted = randomUUID()

  reply.setCookie(name, minted, maxAge === undefined ? TRACKING_COOKIE_OPTIONS : { ...TRACKING_COOKIE_OPTIONS, maxAge })

  return minted
}

function readSignedCookie(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name]

  if (!raw) {
    return null
  }

  const unsigned = request.unsignCookie(raw)

  return unsigned.valid && unsigned.value ? unsigned.value : null
}

const analyticsPlugin: FastifyPluginAsync = async (app) => {
  // 1. Cookie Extraction and Generation on Request
  app.addHook('onRequest', async (request, reply) => {
    try {
      request.visitorId = resolveTrackingCookie(request, reply, 'visitor_id', VISITOR_COOKIE_MAX_AGE)
      // Session-scoped: no maxAge, so it expires when the browser closes.
      request.sessionId = resolveTrackingCookie(request, reply, 'session_id')
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
