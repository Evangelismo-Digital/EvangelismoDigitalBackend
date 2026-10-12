import { FastifyInstance } from 'fastify'
import { formSubmission } from './form.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { formsSchema } from '@http/schemas/forms/forms-schema'

export async function formsRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  app.post(
    '/submit-form',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.forms.submit },
      schema: {
        tags: ['Forms'],
        summary: 'Envia um formulário de evangelismo',
        body: formsSchema,
      },
    },
    formSubmission,
  )
}
