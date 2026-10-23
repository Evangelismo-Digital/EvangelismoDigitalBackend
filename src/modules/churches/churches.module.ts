/* eslint-disable max-lines-per-function */
import { FastifyInstance } from 'fastify'
import { findNearestChurches } from './controllers/find-nearest-churches.controller'
import { createChurch } from './controllers/create-church.controller'
import { verifyJwt } from '@modules/auth/guards/verify-jwt.guard'
import { verifyUserRole } from '@modules/auth/guards/verify-user-role.guard'
import { UserRole } from '@prisma/client'
import { deleteChurch } from './controllers/delete-church.controller'
import { findChurchPublicIdByName } from './controllers/find-church-publicId-by-name.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@common/plugins/policies/rate-limit'
import { HTTP_DEADLINE_POLICIES } from '@common/plugins/policies/deadline'

import { cepSchema } from '@common/dto/utils/cep.dto'
import { createChurchBodySchema } from '@modules/churches/dto/create-church.dto'
import { deleteChurchBodySchema } from '@modules/churches/dto/delete-church.dto'
import { findChurchByNameSchema } from '@modules/churches/dto/find-church-by-name.dto'
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
