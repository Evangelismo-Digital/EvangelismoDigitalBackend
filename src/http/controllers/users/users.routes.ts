import { FastifyInstance } from 'fastify'
import { resetPassword } from './reset-password.controller'
import { register, registerAdmin } from './register-user.controller'
import { verifyJwt } from '@middlewares/verify-jwt.middleware'
import { verifyUserRole } from '@middlewares/verify-user-role.middleware'
import { authenticateUser } from './authenticate-user.controller'
import { deleteUser, deleteUserByPublicId } from './delete-user.controller'
import { forgotPassword } from './forgot-password.controller'
import { getUserByPublicId, getUserProfile } from './get-user-profile.controller'
import { updateUser } from './update-user.controller'
import { UserRole } from '@prisma/client'
import { listUsers } from './list-users.controller'
import { searchUsersController } from './search-users.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

export async function usersRoutes(app: FastifyInstance) {
  registerAuthRoutes(app)
  registerProfileRoutes(app)
  registerAdminRoutes(app)
}

/** Registration and session handling — the only routes open to anonymous callers. */
function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    '/register/admin',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register },
    },
    registerAdmin,
  )
  app.post('/register', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register } }, register)
  app.post('/sessions', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session } }, authenticateUser)
  app.post('/forgot-password', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword } }, forgotPassword)
  app.patch('/reset-password', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword } }, resetPassword)
}

/** The caller acting on their own account; authentication is all that is needed. */
function registerProfileRoutes(app: FastifyInstance) {
  app.patch('/me', { onRequest: [verifyJwt] }, updateUser)
  app.get('/me', { onRequest: [verifyJwt] }, getUserProfile)
  app.delete('/me', { onRequest: [verifyJwt] }, deleteUser)
}

/** Everything acting on *other* accounts, so every route also requires ADMIN. */
function registerAdminRoutes(app: FastifyInstance) {
  const adminOnly = [verifyJwt, verifyUserRole([UserRole.ADMIN])]
  // Written once so the three routes acting on one account cannot drift apart.
  const byPublicId = '/:publicId'

  app.get('/', { onRequest: adminOnly, config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list } }, listUsers)
  app.get('/search', { onRequest: adminOnly }, searchUsersController)
  app.patch(byPublicId, { onRequest: adminOnly }, updateUser)
  app.delete(
    byPublicId,
    { onRequest: adminOnly, config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete } },
    deleteUserByPublicId,
  )
  app.get(byPublicId, { onRequest: adminOnly }, getUserByPublicId)
}
