import z from 'zod'

const publicIdDeleteChurchSchema = z.uuid()

export const deleteChurchBodySchema = z.object({
  publicId: publicIdDeleteChurchSchema,
})

export type deleteChurchBodySchema = z.infer<typeof deleteChurchBodySchema>
