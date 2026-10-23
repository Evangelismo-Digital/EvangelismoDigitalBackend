export const CRON_SCHEDULES = {
  /** Every day at midnight (00:00:00) */
  MIDNIGHT_DAILY: '0 0 0 * * *',
  /** Every 5 minutes */
  EVERY_FIVE_MINUTES: '0 */5 * * * *',
  /** Every day at 03:00 (off the midnight sweep) */
  DAILY_3AM: '0 0 3 * * *',
  /** Every day at 04:00 — analytics retention, after the outbox purge at 03:00 */
  DAILY_4AM: '0 0 4 * * *',
  /** Every day at 05:00 — failed outbox events retention, after analytics at 04:00 */
  DAILY_5AM: '0 0 5 * * *',
} as const
