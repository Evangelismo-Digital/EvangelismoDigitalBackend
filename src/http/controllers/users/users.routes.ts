import { FastifyInstance } from 'fastify'
import { resetPassword } from './reset-password.controller'
import { register, registerAdmin } from './register-user.controller'
import { verifyJwt } from '@middlewares/verify-jwt.middleware'
import { verifyUserRole } from '@middlewares/verify-user-role.middleware'
import { authenticateUser, handleAuthenticateUserRouteError } from './authenticate-user.controller'
import { deleteUser, deleteUserByPublicId } from './delete-user.controller'
import { forgotPassword } from './forgot-password.controller'
import { getUserByPublicId, getUserProfile } from './get-user-profile.controller'
import { updateUser } from './update-user.controller'
import { UserRole } from '@prisma/client'
import { listUsers } from './list-users.controller'
import { searchUsersController } from './search-users.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

export async function usersRoutes(app: FastifyInstance) {
  // Register routes:
  app.post(
    '/register/admin',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.registerAdmin },
    },
    registerAdmin,
  )
  app.post('/register', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register } }, register)

  // Authentication routes:
  app.post(
    '/sessions',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session },
      errorHandler: handleAuthenticateUserRouteError,
    },
    authenticateUser,
  )
  app.post('/forgot-password', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword } }, forgotPassword)
  app.patch('/reset-password', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword } }, resetPassword)

  // User profile routes
  app.patch(
    '/me',
    {
      onRequest: [verifyJwt],
    },
    updateUser,
  )
  app.get(
    '/me',
    {
      onRequest: [verifyJwt],
    },
    getUserProfile,
  )
  app.delete(
    '/me',
    {
      onRequest: [verifyJwt],
    },
    deleteUser,
  )

  // List users route:
  app.get(
    '/',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list },
    },
    listUsers,
  )
  app.get('/search', { onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])] }, searchUsersController)

  // Users administration routes:
  app.patch('/:publicId', { onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])] }, updateUser)
  app.delete(
    '/:publicId',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete },
    },
    deleteUserByPublicId,
  )
  app.get('/:publicId', { onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])] }, getUserByPublicId)
}
