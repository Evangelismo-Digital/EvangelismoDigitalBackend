import { env } from '@config/env/index'
import { PrismaClient } from '@prisma/client'
import { adapter } from './helpers/configuration'

export const prisma = new PrismaClient({
  adapter,
  log: env.LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : [],
})
