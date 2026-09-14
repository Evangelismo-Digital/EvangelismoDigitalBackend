/* eslint-disable max-lines-per-function */
import { FastifyInstance } from 'fastify'
import { findNearestChurches } from './find-nearest-churches.controller'
import { createChurch } from './create-church.controller'
import { verifyJwt } from '@middlewares/verify-jwt.middleware'
import { verifyUserRole } from '@middlewares/verify-user-role.middleware'
import { UserRole } from '@prisma/client'
import { deleteChurch } from './delete-church.controller'
import { findChurchPublicIdByName } from './find-church-publicId-by-name.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { HTTP_DEADLINE_POLICIES } from '@http/policies/deadline'

import { cepSchema } from '@http/schemas/utils/cep'
import { createChurchBodySchema } from '@http/schemas/churches/create-church-schema'
import { deleteChurchBodySchema } from '@http/schemas/churches/delete-church-schema'
import { findChurchByNameSchema } from '@http/schemas/churches/find-church-by-name-schema'
import z from 'zod'

import { ZodTypeProvider } from 'fastify-type-provider-zod'

export async function churchesRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  app.get(
    '/nearest',
    {
      config: {
        rateLimit: HTTP_RATE_LIMIT_POLICIES.churches.nearest,
        deadlineMs: HTTP_DEADLINE_POLICIES.churches.nearest,
      },
      schema: {
        tags: ['Churches'],
        summary: 'Encontra as igrejas mais próximas de um CEP',
        querystring: z.object({ cep: cepSchema }),
      },
    },
    findNearestChurches,
  )

  app.post(
    '/find-church-publicId-by-name',
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ['Churches'],
        summary: 'Encontra o ID público de uma igreja pelo nome',
        body: findChurchByNameSchema,
      },
    },
    findChurchPublicIdByName,
  )

  app.post(
    '/create',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      schema: {
        tags: ['Churches'],
        summary: 'Cria uma nova igreja',
        body: createChurchBodySchema,
      },
    },
    createChurch,
  )

  app.delete(
    '/delete',
    {
      onRequest: [verifyJwt, verifyUserRole([UserRole.ADMIN])],
      schema: {
        tags: ['Churches'],
        summary: 'Deleta uma igreja pelo ID público',
        body: deleteChurchBodySchema,
      },
    },
    deleteChurch,
  )
}
