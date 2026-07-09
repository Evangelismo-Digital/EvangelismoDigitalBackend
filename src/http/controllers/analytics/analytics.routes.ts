import { FastifyInstance } from 'fastify'
import { trackEvent } from './track-event.controller'

export async function analyticsRoutes(app: FastifyInstance) {
  app.post('/events', trackEvent)
}
