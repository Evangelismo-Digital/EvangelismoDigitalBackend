import { FastifyInstance } from 'fastify'
import { formSubmission } from './form.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

export async function formsRoutes(app: FastifyInstance) {
  app.post('/submit-form', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.forms.submit } }, formSubmission)
}
