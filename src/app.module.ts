import type { FastifyInstance } from 'fastify'
import { authRoutes } from '@modules/auth/auth.module'
import { usersRoutes } from '@modules/users/users.module'
import { formsRoutes } from '@modules/forms/forms.module'
import { churchesRoutes } from '@modules/churches/churches.module'
import { analyticsRoutes } from '@modules/analytics/analytics.module'

import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod'

export async function appModule(app: FastifyInstance) {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.register(formsRoutes, { prefix: '/forms' })
  await app.register(churchesRoutes, { prefix: '/churches' })
  await app.register(analyticsRoutes, { prefix: '/analytics' })
}
