import z from 'zod'

export const usernameSchema = z.string().trim().min(3).max(60)
