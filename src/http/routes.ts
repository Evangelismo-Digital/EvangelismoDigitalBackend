import type { FastifyInstance } from 'fastify'
import { usersRoutes } from '@controllers/users/users.routes'
import { formsRoutes } from '@controllers/forms/forms.routes'
import { churchesRoutes } from '@controllers/churches/churches.routes'
import { analyticsRoutes } from '@controllers/analytics/analytics.routes'

import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod'

export async function appRoutes(app: FastifyInstance) {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(usersRoutes, { prefix: '/users' })
  app.register(formsRoutes, { prefix: '/forms' })
  app.register(churchesRoutes, { prefix: '/churches' })
  app.register(analyticsRoutes, { prefix: '/analytics' })
}
