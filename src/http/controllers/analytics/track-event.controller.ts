import type { FastifyReply, FastifyRequest } from 'fastify'
import { trackEventSchema } from '@schemas/analytics/track-event-schema'
import { makeTrackAnalyticsUseCase } from '@use-cases/factories/make-track-analytics-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { clientIpOf } from '@http/client-ip'

export async function trackEvent(request: FastifyRequest, reply: FastifyReply) {
  const { eventType, path, payload } = trackEventSchema.parse(request.body)

  const trackAnalyticsUseCase = makeTrackAnalyticsUseCase()

  const result = await trackAnalyticsUseCase.execute({
    visitorId: request.visitorId,
    sessionId: request.sessionId,
    eventType,
    path,
    ipAddress: clientIpOf(request),
    userAgent: request.headers['user-agent'] || null,
    ...utmParams(request.query as Record<string, string | undefined>),
    payload,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(201).send()
}

/** Campaign parameters are all optional and all normalised to null. */
const UTM_PARAMS = {
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmTerm: 'utm_term',
  utmContent: 'utm_content',
} as const

function utmParams(query: Record<string, string | undefined>): Record<keyof typeof UTM_PARAMS, string | null> {
  return Object.fromEntries(
    Object.entries(UTM_PARAMS).map(([field, param]) => [field, query?.[param] || null]),
  ) as Record<keyof typeof UTM_PARAMS, string | null>
}
