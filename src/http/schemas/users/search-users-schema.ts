import { z } from 'zod'

export const searchUsersSchema = z.object({
  query: z.string().optional().default(''),
  page: z.coerce.number().int().positive().default(1),
})
