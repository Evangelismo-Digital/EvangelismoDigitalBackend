import z from 'zod'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

export const usernameSchema = z.string().trim().min(VALIDATION_LIMITS.USERNAME_MIN).max(VALIDATION_LIMITS.USERNAME_MAX)
