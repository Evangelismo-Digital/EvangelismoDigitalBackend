import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@env/index'
import { logger } from '@lib/logger'

const MEMORY_CHECK_INTERVAL_MS = 60_000
const HEAP_WARNING_THRESHOLD_MB = 400

const memoryMonitorPlugin: FastifyPluginAsync = async (app) => {
  if (env.NODE_ENV !== 'production') {
    return
  }

  let interval: NodeJS.Timeout | null = null

  app.addHook('onReady', () => {
    interval = setInterval(() => {
      const memUsage = process.memoryUsage()
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024
      const rssMB = memUsage.rss / 1024 / 1024

      // Alert at 400MB heap usage (80% of 512MB Docker limit)
      if (heapUsedMB > HEAP_WARNING_THRESHOLD_MB) {
        logger.warn({
          msg: 'High memory usage detected',
          heapUsedMB: Math.round(heapUsedMB),
          rssMB: Math.round(rssMB),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        })
      }
    }, MEMORY_CHECK_INTERVAL_MS)
  })

  app.addHook('onClose', () => {
    if (interval) {
      clearInterval(interval)
      logger.info('✅ Memory monitor interval cleared')
    }
  })
}

export const memoryMonitor = fp(memoryMonitorPlugin, {
  name: 'memory-monitor',
})
