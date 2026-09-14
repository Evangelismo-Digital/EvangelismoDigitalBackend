/* eslint-disable max-lines-per-function */
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

import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { authenticateSchema } from '@http/schemas/users/authenticate-schema'
import { forgotPasswordSchema } from '@http/schemas/users/forgot-password-schema'
import { registerSchema } from '@http/schemas/users/register-schema'
import { resetPasswordSchema } from '@http/schemas/users/reset-password-schema'
import { searchUsersSchema } from '@http/schemas/users/search-users-schema'
import { updateSchema } from '@http/schemas/users/update-schema'
import { publicIdSchema } from '@http/schemas/utils/public-id-schema'

export async function usersRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  registerAuthRoutes(app)
  registerProfileRoutes(app)
  registerAdminRoutes(app)
}

/** Registration and session handling — the only routes open to anonymous callers. */
function registerAuthRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  app.post(
    '/register/admin',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register },
      schema: { tags: ['Users'], summary: 'Register admin', body: registerSchema },
    },
    registerAdmin,
  )
  app.post(
    '/register',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register },
      schema: { tags: ['Users'], summary: 'Register user', body: registerSchema },
    },
    register,
  )

  app.post(
    '/sessions',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session },
      schema: { tags: ['Users'], summary: 'Authenticate user', body: authenticateSchema },
    },
    authenticateUser,
  )

  app.post(
    '/forgot-password',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword },
      schema: { tags: ['Users'], summary: 'Forgot password', body: forgotPasswordSchema },
    },
    forgotPassword,
  )

  app.patch(
    '/reset-password',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword },
      schema: { tags: ['Users'], summary: 'Reset password', body: resetPasswordSchema },
    },
    resetPassword,
  )
}

/** The caller acting on their own account; authentication is all that is needed. */
function registerProfileRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  app.patch(
    '/me',
    {
      onRequest: [verifyJwt],
      schema: { tags: ['Users'], summary: 'Update profile', body: updateSchema },
    },
    updateUser,
  )

  app.get(
    '/me',
    {
      onRequest: [verifyJwt],
      schema: { tags: ['Users'], summary: 'Get profile' },
    },
    getUserProfile,
  )

  app.delete(
    '/me',
    {
      onRequest: [verifyJwt],
      schema: { tags: ['Users'], summary: 'Delete profile' },
    },
    deleteUser,
  )
}

/** Everything acting on *other* accounts, so every route also requires ADMIN. */
function registerAdminRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  const adminOnly = [verifyJwt, verifyUserRole([UserRole.ADMIN])]
  const byPublicId = '/:publicId'

  app.get(
    '/',
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list },
      schema: { tags: ['Users'], summary: 'List users' },
    },
    listUsers,
  )

  app.get(
    '/search',
    {
      onRequest: adminOnly,
      schema: { tags: ['Users'], summary: 'Search users', querystring: searchUsersSchema },
    },
    searchUsersController,
  )

  app.patch(
    byPublicId,
    {
      onRequest: adminOnly,
      schema: { tags: ['Users'], summary: 'Update user', params: publicIdSchema, body: updateSchema },
    },
    updateUser,
  )

  app.delete(
    byPublicId,
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete },
      schema: { tags: ['Users'], summary: 'Delete user', params: publicIdSchema },
    },
    deleteUserByPublicId,
  )

  app.get(
    byPublicId,
    {
      onRequest: adminOnly,
      schema: { tags: ['Users'], summary: 'Get user by public ID', params: publicIdSchema },
    },
    getUserByPublicId,
  )
}
