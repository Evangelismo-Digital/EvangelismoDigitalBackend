import { Counter, Histogram } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

export const collectMetricsEmailsSent = registry
  ? new Counter({
      name: 'emails_sent_total',
      help: 'Emails successfully sent to SMTP, counted per successful send (per recipient; a degraded-path re-send re-increments)',
      registers: [registry],
    })
  : null

export const collectMetricsEmailsFailed = registry
  ? new Counter({
      name: 'emails_failed_total',
      help: 'Email send failures, counted per recipient per attempt (not per batch)',
      labelNames: ['error_type'],
      registers: [registry],
    })
  : null

export const collectMetricsEmailsSkipped = registry
  ? new Counter({
      name: 'emails_skipped_total',
      help: 'Email jobs not sent for a non-failure reason (idempotency dedup, contention, or expiry)',
      labelNames: ['reason'],
      registers: [registry],
    })
  : null

export const collectMetricsEmailBatchDuration = registry
  ? new Histogram({
      name: 'email_batch_duration_seconds',
      help: 'Duration of the SMTP send batch (Promise.allSettled), recorded per attempt',
      buckets: [0.5, 1, 2, 5, 10, 30, 60],
      registers: [registry],
    })
  : null
