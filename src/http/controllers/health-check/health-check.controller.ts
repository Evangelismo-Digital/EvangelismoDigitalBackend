import type { FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '@lib/logger'
import { logError } from '@lib/logger/helpers'
import { prisma } from '@lib/prisma'
import { HEALTH_CHECK_CONSTANTS } from 'messages/constants/health-check/health-check'

export async function healthCheck(_request: FastifyRequest, reply: FastifyReply) {
  const memoryUsage = process.memoryUsage()

  const startTime = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`

    const uptime = process.uptime()
    const timestamp = new Date().toISOString()
    const duration = Date.now() - startTime

    logger.info({ uptime, duration }, 'Healthcheck realizado com sucesso')

    return reply.status(200).send({
      status: 'ok',
      uptime,
      timestamp,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
    })
  } catch (error) {
    const duration = Date.now() - startTime
    logError(error, { duration }, 'Falha no healthcheck')

    return reply.status(500).send({ status: 'error', message: HEALTH_CHECK_CONSTANTS.INTERNAL_ERROR })
  }
}
