import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import { DistributedLock, LockToken } from './distributed-lock'

/**
 * Runs `work` while holding a distributed lock, releasing it whatever happens.
 *
 * `OutboxProcessor` and `OutboxMaintenance` each carried their own copy of this
 * — acquire, bail if someone else holds it, hand the body a `renew` callback,
 * log-and-capture on failure, release in `finally`. The two copies differed by
 * one line, and a lock is precisely the thing you do not want two slightly
 * different implementations of: a missing `finally` in one of them strands the
 * key until its TTL expires and stalls the outbox for that long.
 *
 * Non-acquisition is a normal outcome, not a failure: another pod holds the
 * lock and is already doing the work. It returns quietly, optionally saying so.
 */
export interface WithDistributedLockParams {
  lockKey: string
  /** Safety ceiling against a crashed holder deadlocking the key forever. */
  ttlMs: number
  /** Logged with the error if the body throws. */
  errorMessage: string
  /**
   * Logged at warn when the lock was already held. Omit where contention is
   * routine and expected — the maintenance sweep runs on a cron and losing the
   * race to another pod is the normal case, not something to warn about.
   */
  skippedMessage?: string | null
  work: (renew: () => Promise<void>) => Promise<void>
}

export async function withDistributedLock(params: WithDistributedLockParams): Promise<void> {
  const { lockKey, ttlMs, errorMessage, skippedMessage, work } = params
  let lockToken: LockToken | null = null

  try {
    lockToken = await DistributedLock.acquire(lockKey, ttlMs)

    if (!lockToken) {
      if (skippedMessage) logger.warn(skippedMessage)
      return
    }

    const token = lockToken

    await work(async () => {
      // `renew` reports whether the lock was still ours; the batch loops do not
      // branch on it, so the boolean is deliberately discarded here.
      await DistributedLock.renew(lockKey, token, ttlMs)
    })
  } catch (error) {
    logger.error({ error }, errorMessage)
    captureError(error)
  } finally {
    if (lockToken) {
      await DistributedLock.release(lockKey, lockToken)
    }
  }
}
