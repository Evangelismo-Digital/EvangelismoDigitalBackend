/* eslint-disable max-lines-per-function */
import { FastifyInstance } from 'fastify'
import { register, registerAdmin } from './controllers/register-user.controller'
import { verifyJwt } from '@modules/auth/guards/verify-jwt.guard'
import { verifyUserRole } from '@modules/auth/guards/verify-user-role.guard'
import { deleteUser, deleteUserByPublicId } from './controllers/delete-user.controller'
import { getUserByPublicId, getUserProfile } from './controllers/get-user-profile.controller'
import { updateUser } from './controllers/update-user.controller'
import { UserRole } from '@prisma/client'
import { listUsers } from './controllers/list-users.controller'
import { searchUsersController } from './controllers/search-users.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@common/plugins/policies/rate-limit'

import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { registerSchema } from './dto/register-user.dto'
import { searchUsersSchema } from './dto/search-users.dto'
import { updateSchema } from './dto/update-user.dto'
import { publicIdSchema } from '@common/dto/utils/public-id.dto'

export async function usersRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  registerRegistrationRoutes(app)
  registerProfileRoutes(app)
  registerAdminRoutes(app)
}

/** Registration routes — open to anonymous callers (or ADMIN for admin registration). */
function registerRegistrationRoutes(appInst: FastifyInstance) {
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
