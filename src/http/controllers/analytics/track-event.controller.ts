import type { FastifyReply, FastifyRequest } from 'fastify'
import { trackEventSchema } from '@schemas/analytics/track-event-schema'
import { makeTrackAnalyticsUseCase } from '@use-cases/factories/make-track-analytics-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

export async function trackEvent(request: FastifyRequest, reply: FastifyReply) {
  const { eventType, path, payload } = trackEventSchema.parse(request.body)

  const xff = request.headers['x-forwarded-for']
  const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(',')[0].trim() || request.ip

  const query = request.query as Record<string, string | undefined>

  const trackAnalyticsUseCase = makeTrackAnalyticsUseCase()

  const result = await trackAnalyticsUseCase.execute({
    visitorId: request.visitorId,
    sessionId: request.sessionId,
    eventType,
    path,
    ipAddress: clientIp,
    userAgent: request.headers['user-agent'] || null,
    utmSource: query?.['utm_source'] || null,
    utmMedium: query?.['utm_medium'] || null,
    utmCampaign: query?.['utm_campaign'] || null,
    utmTerm: query?.['utm_term'] || null,
    utmContent: query?.['utm_content'] || null,
    payload,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.status(201).send()
}
