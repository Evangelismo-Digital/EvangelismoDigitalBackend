import { z } from 'zod'

export const trackEventSchema = z.object({
  eventType: z.string().min(1),
  path: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
})
