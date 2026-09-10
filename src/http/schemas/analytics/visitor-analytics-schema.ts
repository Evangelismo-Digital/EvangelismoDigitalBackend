import { z } from 'zod'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

/**
 * A retained visitor can hold fourteen months of rows, so the page size is
 * bounded on both ends: a default that is useful and a ceiling that stops one
 * request from trying to serialise the whole history.
 */
export const visitorAnalyticsParamsSchema = z.object({
  visitorId: z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_VISITOR_ID_MAX),
})

export const visitorAnalyticsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_MAX)
    .default(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_DEFAULT),
  /** `occurredAt` of the previous page's last row. */
  cursor: z.coerce.date().nullable().default(null),
})

export const visitorsByUserQuerySchema = z.object({
  userId: z.uuid(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_MAX)
    .default(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_DEFAULT),
})
