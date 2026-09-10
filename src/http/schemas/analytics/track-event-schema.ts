import { z } from 'zod'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

/**
 * The event types the API accepts.
 *
 * An allowlist, not a free string: `eventType` is a low-cardinality dimension
 * that every aggregate groups by, so an open field lets a caller create
 * unbounded distinct values in an indexed column. It also documents the
 * vocabulary the frontend is expected to emit, which a `z.string()` did not.
 */
const EVENT_TYPES = [
  'page_view',
  'page_exit',
  'click',
  'form_start',
  'form_submit',
  'scroll_depth',
  'search',
  'outbound_click',
] as const

/**
 * Payload values are scalars only — no nesting.
 *
 * A recursive value type would let a caller send deeply nested JSON that is
 * cheap to produce and expensive to parse, store and later scan. Twenty scalar
 * keys is enough for the annotations these events actually carry.
 */
const payloadSchema = z
  .record(
    z.string().max(VALIDATION_LIMITS.ANALYTICS_PAYLOAD_VALUE_MAX),
    z.union([z.string().max(VALIDATION_LIMITS.ANALYTICS_PAYLOAD_VALUE_MAX), z.number(), z.boolean(), z.null()]),
  )
  .refine(
    (payload) => Object.keys(payload).length <= VALIDATION_LIMITS.ANALYTICS_PAYLOAD_KEYS_MAX,
    `payload: máximo de ${VALIDATION_LIMITS.ANALYTICS_PAYLOAD_KEYS_MAX} chaves`,
  )

const trackEventSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  path: z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_PATH_MAX),
  title: z.string().max(VALIDATION_LIMITS.ANALYTICS_TITLE_MAX).optional(),
  /**
   * Any string, not `z.url()`: this carries the INTERNAL referrer — the path of
   * the previous page — as often as an absolute URL, and `z.url()` would reject
   * `/post/anterior` and silently drop the navigation graph.
   */
  referrer: z.string().max(VALIDATION_LIMITS.ANALYTICS_REFERRER_MAX).optional(),
  durationMs: z.number().int().min(0).max(VALIDATION_LIMITS.ANALYTICS_DURATION_MS_MAX).optional(),
  scrollDepth: z.number().int().min(0).max(VALIDATION_LIMITS.ANALYTICS_SCROLL_DEPTH_MAX).optional(),
  payload: payloadSchema.optional(),
})

/**
 * A batch. This is the natural shape for `sendBeacon`, which cannot set headers
 * and gets one shot at flushing on `visibilitychange`.
 */
export const trackEventsBatchSchema = z.object({
  events: z.array(trackEventSchema).min(1).max(VALIDATION_LIMITS.ANALYTICS_EVENTS_PER_BATCH_MAX),
})
