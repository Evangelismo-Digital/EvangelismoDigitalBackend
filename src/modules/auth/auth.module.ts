import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { authenticateUser } from './controllers/authenticate-user.controller'
import { forgotPassword } from './controllers/forgot-password.controller'
import { resetPassword } from './controllers/reset-password.controller'
import { authenticateSchema } from './dto/authenticate.dto'
import { forgotPasswordSchema } from './dto/forgot-password.dto'
import { resetPasswordSchema } from './dto/reset-password.dto'
import { HTTP_RATE_LIMIT_POLICIES } from '@common/plugins/policies/rate-limit'

export async function authRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/sessions',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session },
      schema: { tags: ['Auth'], summary: 'Authenticate user', body: authenticateSchema },
    },
    authenticateUser,
  )

  app.post(
    '/forgot-password',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword },
      schema: { tags: ['Auth'], summary: 'Forgot password', body: forgotPasswordSchema },
    },
    forgotPassword,
  )

  app.patch(
    '/reset-password',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword },
      schema: { tags: ['Auth'], summary: 'Reset password', body: resetPasswordSchema },
    },
    resetPassword,
  )
}
