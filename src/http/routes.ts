import type { FastifyInstance } from 'fastify'
import { usersRoutes } from '@controllers/users/users.routes'
import { healthCheckRoutes } from '@controllers/health-check/health-check.routes'
import { formsRoutes } from '@controllers/forms/forms.routes'
import { churchesRoutes } from '@controllers/churches/churches.routes'
import { analyticsRoutes } from '@controllers/analytics/analytics.routes'

export async function appRoutes(app: FastifyInstance) {
  app.register(usersRoutes, { prefix: '/users' })
  app.register(healthCheckRoutes, { prefix: '/health' })
  app.register(formsRoutes, { prefix: '/forms' })
  app.register(churchesRoutes, { prefix: '/churches' })
  app.register(analyticsRoutes, { prefix: '/analytics' })
}
