/**
 * Regression — an anonymous page view un-identified a visitor who had just
 * logged in.
 *
 * WHAT BROKE: `PrismaAnalyticsRepository.upsertVisitor` wrote
 * `update: { userId: data.userId ?? null }`. That spelling looks right, and is
 * right one method away in `upsertSession`, where an absent UTM parameter must
 * clear a stored one. For the visitor's user link it is exactly backwards: the
 * link is sticky by design.
 *
 * WHY IT MATTERED: this platform is a blog whose readers are anonymous. After a
 * successful login and `POST /analytics/identify`, the very next page view
 * carries no JWT — so `userId` arrived undefined, became null, and the stitching
 * was undone within a single navigation. Identity stitching would have appeared
 * to work in every test using the in-memory double (which preserved the link)
 * and silently produced nothing in production.
 *
 * HOW IT WAS FOUND: not by review. The shared repository contract was run
 * against both implementations, and the double and Postgres disagreed — the
 * exact divergence that contract exists to surface.
 *
 * DEFECT: analytics-cookie-architecture §3.7 (identity stitching).
 *
 * The contract suite covers this for both implementations; this file pins the
 * asymmetry itself, so that a later "consistency" refactor making the two
 * upserts symmetrical has to delete an explicitly-reasoned test to do it.
 */
import { describe, expect, it } from 'vitest'
import { isOk } from 'core/shared/result'
import { InMemoryAnalyticsRepository } from './in-memory-analytics-repository'

const USER = 'user-public-id'

describe('visitor user link is not wiped by a later anonymous upsert', () => {
  it('keeps the link when a subsequent upsert carries no userId', async () => {
    const repository = new InMemoryAnalyticsRepository()

    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertVisitor({ visitorId: 'visitor-1', userId: USER })
    await repository.upsertVisitor({ visitorId: 'visitor-1' })

    const found = await repository.findVisitorByVisitorId('visitor-1')

    expect(isOk(found)).toBe(true)
    if (isOk(found)) expect(found.value?.userId).toBe(USER)
  })

  it('survives a long run of anonymous page views after login', async () => {
    const repository = new InMemoryAnalyticsRepository()

    await repository.upsertVisitor({ visitorId: 'visitor-1', userId: USER })

    for (let i = 0; i < 10; i++) {
      await repository.upsertVisitor({ visitorId: 'visitor-1' })
    }

    const found = await repository.findVisitorByVisitorId('visitor-1')

    if (isOk(found)) expect(found.value?.userId).toBe(USER)
  })

  /**
   * COUNTERWEIGHT. "Never change userId" would satisfy both tests above by doing
   * nothing, and identity stitching would be just as broken in the other
   * direction — silently, since nothing else asserts the link can be written.
   */
  it('still establishes the link in the first place', async () => {
    const repository = new InMemoryAnalyticsRepository()

    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertVisitor({ visitorId: 'visitor-1', userId: USER })

    const found = await repository.findVisitorByVisitorId('visitor-1')

    if (isOk(found)) expect(found.value?.userId).toBe(USER)
  })

  /**
   * COUNTERWEIGHT. The opposite rule, one method away, must remain intact:
   * session attributes ARE cleared by absence, because a campaign that ended has
   * to stop being attributed. Pinning both here is what stops a future refactor
   * from "harmonising" them.
   */
  it('does not extend link-stickiness to session attributes', async () => {
    const repository = new InMemoryAnalyticsRepository()

    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1', utmSource: 'google' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

    const found = await repository.findSessionBySessionId('session-1')

    if (isOk(found)) expect(found.value?.utmSource).toBeNull()
  })
})
