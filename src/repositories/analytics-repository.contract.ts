import { describe, it, expect, beforeEach } from 'vitest'
import { AnalyticsRepository } from 'core/contracts/repository/analytics-repository.interface'
import { isOk } from 'core/shared/result'

/**
 * The behaviour every `AnalyticsRepository` must exhibit, run against **both**
 * the Prisma implementation and the in-memory double.
 *
 * The same reasoning as the churches contract: a double that quietly disagrees
 * with production turns every unit test built on it into an assertion about
 * fiction. The risk is sharper here, because the upsert semantics carry a rule
 * that is easy to state and easy to implement backwards — first-touch
 * attribution must survive updates, while session attributes must be
 * overwritten by them. Two implementations of that in prose is how they drift.
 *
 * Scenarios cover the observable contract only, so they are expressible against
 * both a real table and an array.
 */
export interface AnalyticsRepositoryUnderTest {
  /** A clean repository. Implementations truncate or re-instantiate as needed. */
  create: () => Promise<AnalyticsRepository> | AnalyticsRepository
  /**
   * A `userId` that satisfies whatever referential integrity the implementation
   * enforces, returned after being made to exist.
   *
   * Needed because `userId` is a foreign key to `users.public_id` under Prisma
   * and a plain string in the double. Asserting the link with an invented id
   * passes in memory and is rejected by Postgres — the divergence is in the test
   * setup rather than the code, and it is just as capable of hiding a real one.
   */
  createLinkableUser: () => Promise<string> | string
}

export function describeAnalyticsRepositoryContract(label: string, setup: AnalyticsRepositoryUnderTest): void {
  describe(`AnalyticsRepository contract — ${label}`, () => {
    let repository: AnalyticsRepository

    beforeEach(async () => {
      repository = await setup.create()
    })

    async function seedVisitor(visitorId = 'visitor-1', overrides = {}) {
      const result = await repository.upsertVisitor({ visitorId, ...overrides })
      expect(isOk(result)).toBe(true)
      return result
    }

    async function seedSession(sessionId = 'session-1', visitorId = 'visitor-1', overrides = {}) {
      const result = await repository.upsertSession({ sessionId, visitorId, ...overrides })
      expect(isOk(result)).toBe(true)
      return result
    }

    describe('upsertVisitor', () => {
      it('creates a visitor that can be read back by its opaque id', async () => {
        await seedVisitor('visitor-1')

        const found = await repository.findVisitorByVisitorId('visitor-1')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) {
          expect(found.value?.visitorId).toBe('visitor-1')
          expect(found.value?.sessionCount).toBe(1)
        }
      })

      it('records first-touch attribution on create', async () => {
        await seedVisitor('visitor-1', {
          firstUtmSource: 'google',
          firstUtmCampaign: 'acquisition',
          firstLandingPath: '/inicio',
        })

        const found = await repository.findVisitorByVisitorId('visitor-1')

        if (isOk(found)) {
          expect(found.value?.firstUtmSource).toBe('google')
          expect(found.value?.firstUtmCampaign).toBe('acquisition')
          expect(found.value?.firstLandingPath).toBe('/inicio')
        }
      })

      it('does NOT overwrite first-touch attribution on a later upsert', async () => {
        await seedVisitor('visitor-1', { firstUtmSource: 'google', firstLandingPath: '/inicio' })
        await seedVisitor('visitor-1', { firstUtmSource: 'newsletter', firstLandingPath: '/outra' })

        const found = await repository.findVisitorByVisitorId('visitor-1')

        // The counterweight to "attributes are refreshed on update" below: these
        // two rules are opposites and live one method apart.
        if (isOk(found)) {
          expect(found.value?.firstUtmSource).toBe('google')
          expect(found.value?.firstLandingPath).toBe('/inicio')
        }
      })

      it('does not create a second row for the same visitor', async () => {
        await seedVisitor('visitor-1')
        await seedVisitor('visitor-1')

        const found = await repository.findVisitorByVisitorId('visitor-1')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('answers null for a visitor that was never seen', async () => {
        const found = await repository.findVisitorByVisitorId('never-existed')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('keeps distinct visitors distinct, and returns the one asked for', async () => {
        await seedVisitor('visitor-1', { firstLandingPath: '/primeiro' })
        await seedVisitor('visitor-2', { firstLandingPath: '/segundo' })

        const first = await repository.findVisitorByVisitorId('visitor-1')
        const second = await repository.findVisitorByVisitorId('visitor-2')

        // With one visitor in the store, a lookup that ignores its argument is
        // indistinguishable from one that honours it.
        if (isOk(first)) expect(first.value?.firstLandingPath).toBe('/primeiro')
        if (isOk(second)) expect(second.value?.firstLandingPath).toBe('/segundo')
      })

      it('answers null for an absent visitor even when other visitors exist', async () => {
        await seedVisitor('visitor-1')

        const found = await repository.findVisitorByVisitorId('never-existed')

        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('preserves an established user link when a later upsert omits it', async () => {
        const userId = await setup.createLinkableUser()

        await seedVisitor('visitor-1', { userId: null })
        expect(isOk(await repository.upsertVisitor({ visitorId: 'visitor-1', userId }))).toBe(true)
        expect(isOk(await repository.upsertVisitor({ visitorId: 'visitor-1' }))).toBe(true)

        const found = await repository.findVisitorByVisitorId('visitor-1')

        // An anonymous page view arriving after login must not un-identify the
        // visitor — unlike session UTM attributes, this link is sticky. On a
        // blog nearly every request after sign-in is anonymous, so the opposite
        // behaviour would discard the link almost immediately.
        if (isOk(found)) expect(found.value?.userId).toBe(userId)
      })

      it('still allows the link to be established and re-pointed', async () => {
        const userId = await setup.createLinkableUser()

        await seedVisitor('visitor-1')
        await repository.upsertVisitor({ visitorId: 'visitor-1', userId })

        const found = await repository.findVisitorByVisitorId('visitor-1')

        // Counterweight: "never overwrite" would satisfy the test above by doing
        // nothing at all, and stitching would silently stop working.
        if (isOk(found)) expect(found.value?.userId).toBe(userId)
      })
    })

    describe('upsertSession', () => {
      it('creates a session linked to its visitor', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const found = await repository.findSessionBySessionId('session-1')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) {
          expect(found.value?.sessionId).toBe('session-1')
          expect(found.value?.visitorId).toBe('visitor-1')
        }
      })

      it('starts a session as a bounce with no page views counted', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const found = await repository.findSessionBySessionId('session-1')

        if (isOk(found)) {
          expect(found.value?.isBounce).toBe(true)
          expect(found.value?.pageViewCount).toBe(0)
          expect(found.value?.eventCount).toBe(0)
        }
      })

      it('refreshes session attributes on a later upsert', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1', { utmSource: 'google', browser: 'Chrome' })
        await seedSession('session-1', 'visitor-1', { utmSource: 'newsletter', browser: 'Firefox' })

        const found = await repository.findSessionBySessionId('session-1')

        if (isOk(found)) {
          expect(found.value?.utmSource).toBe('newsletter')
          expect(found.value?.browser).toBe('Firefox')
        }
      })

      it('CLEARS an attribute that is absent from a later upsert', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1', { utmSource: 'google' })
        await seedSession('session-1', 'visitor-1', {})

        const found = await repository.findSessionBySessionId('session-1')

        // Not an accident of `?? null`: a campaign that has ended must stop being
        // attributed, so absence has to overwrite rather than preserve.
        if (isOk(found)) expect(found.value?.utmSource).toBeNull()
      })

      it('stores the parsed user-agent fields and no raw string', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1', { browser: 'Safari', os: 'iOS', device: 'mobile' })

        const found = await repository.findSessionBySessionId('session-1')

        if (isOk(found)) {
          expect(found.value?.browser).toBe('Safari')
          expect(found.value?.os).toBe('iOS')
          expect(found.value?.device).toBe('mobile')
          expect(found.value).not.toHaveProperty('userAgent')
        }
      })

      it('answers null for a session that does not exist', async () => {
        const found = await repository.findSessionBySessionId('never-existed')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('keeps distinct sessions distinct, and returns the one asked for', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1', { landingPath: '/primeiro' })
        await seedSession('session-2', 'visitor-1', { landingPath: '/segundo' })

        const first = await repository.findSessionBySessionId('session-1')
        const second = await repository.findSessionBySessionId('session-2')

        if (isOk(first)) expect(first.value?.landingPath).toBe('/primeiro')
        if (isOk(second)) expect(second.value?.landingPath).toBe('/segundo')
      })

      it('answers null for an absent session even when other sessions exist', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const found = await repository.findSessionBySessionId('never-existed')

        if (isOk(found)) expect(found.value).toBeNull()
      })
    })

    describe('createEvent', () => {
      it('persists an event against its session', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const created = await repository.createEvent({
          sessionId: 'session-1',
          eventType: 'page_view',
          path: '/post/algo',
        })

        expect(isOk(created)).toBe(true)
        if (isOk(created)) {
          expect(created.value.eventType).toBe('page_view')
          expect(created.value.path).toBe('/post/algo')
        }
      })

      it('persists reading depth — the measurement the whole design exists for', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const created = await repository.createEvent({
          sessionId: 'session-1',
          eventType: 'page_exit',
          path: '/post/algo',
          durationMs: 45_000,
          scrollDepth: 80,
          title: 'Um post',
        })

        if (isOk(created)) {
          expect(created.value.durationMs).toBe(45_000)
          expect(created.value.scrollDepth).toBe(80)
          expect(created.value.title).toBe('Um post')
        }
      })

      it('defaults the optional measurements to null rather than zero', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const created = await repository.createEvent({
          sessionId: 'session-1',
          eventType: 'click',
          path: '/x',
        })

        // Zero would be a real reading of "0 ms, 0 % scrolled"; null is "not
        // measured". Conflating them would poison every average.
        if (isOk(created)) {
          expect(created.value.durationMs).toBeNull()
          expect(created.value.scrollDepth).toBeNull()
        }
      })

      it('persists the internal referrer — which page the visitor came from', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const created = await repository.createEvent({
          sessionId: 'session-1',
          eventType: 'page_view',
          path: '/post/destino',
          referrer: '/post/origem',
        })

        if (isOk(created)) expect(created.value.referrer).toBe('/post/origem')
      })

      it('round-trips a JSON payload', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const created = await repository.createEvent({
          sessionId: 'session-1',
          eventType: 'click',
          path: '/x',
          payload: { buttonId: 'assinar', position: 3 },
        })

        if (isOk(created)) expect(created.value.payload).toEqual({ buttonId: 'assinar', position: 3 })
      })
    })
    describe('erasure', () => {
      it('removes the visitor, their sessions and their events together', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await repository.createEvent({ sessionId: 'session-1', eventType: 'page_view', path: '/a' })

        const erased = await repository.deleteVisitorData('visitor-1')

        expect(isOk(erased)).toBe(true)
        if (isOk(erased)) expect(erased.value).toBe(1)

        const visitor = await repository.findVisitorByVisitorId('visitor-1')
        const session = await repository.findSessionBySessionId('session-1')

        // Erasure means the whole record. A double that dropped only the visitor
        // row would leave sessions no query returns, and "the visitor is gone"
        // would pass while the two implementations meant different things.
        if (isOk(visitor)) expect(visitor.value).toBeNull()
        if (isOk(session)) expect(session.value).toBeNull()
      })

      it('leaves other visitors untouched', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedVisitor('visitor-2')
        await seedSession('session-2', 'visitor-2')

        await repository.deleteVisitorData('visitor-1')

        const survivor = await repository.findVisitorByVisitorId('visitor-2')
        const survivingSession = await repository.findSessionBySessionId('session-2')

        if (isOk(survivor)) expect(survivor.value).not.toBeNull()
        if (isOk(survivingSession)) expect(survivingSession.value).not.toBeNull()
      })

      it('treats erasing an unknown visitor as success, not failure', async () => {
        const erased = await repository.deleteVisitorData('never-existed')

        // A revocation from someone who was never tracked must not error.
        expect(isOk(erased)).toBe(true)
        if (isOk(erased)) expect(erased.value).toBe(0)
      })

      it('erases every visitor linked to a user', async () => {
        const userId = await setup.createLinkableUser()

        await seedVisitor('visitor-1', { userId })
        await seedSession('session-1', 'visitor-1')
        await seedVisitor('visitor-2', { userId })
        await seedVisitor('visitor-3')

        const erased = await repository.deleteDataForUser(userId)

        if (isOk(erased)) expect(erased.value).toBe(2)

        const anonymous = await repository.findVisitorByVisitorId('visitor-3')
        if (isOk(anonymous)) expect(anonymous.value).not.toBeNull()
      })
    })

    describe('retention', () => {
      const LONG_AGO = new Date('2020-01-01T00:00:00Z')
      const FUTURE = new Date('2999-01-01T00:00:00Z')

      it('purges nothing when nothing is older than the cutoff', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await repository.createEvent({ sessionId: 'session-1', eventType: 'page_view', path: '/a' })

        const events = await repository.purgeEventsOlderThan(LONG_AGO, 100)
        const sessions = await repository.purgeSessionsOlderThan(LONG_AGO, 100)
        const visitors = await repository.purgeVisitorsInactiveSince(LONG_AGO, 100)

        if (isOk(events)) expect(events.value).toBe(0)
        if (isOk(sessions)) expect(sessions.value).toBe(0)
        if (isOk(visitors)) expect(visitors.value).toBe(0)
      })

      it('purges events past the cutoff', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await repository.createEvent({ sessionId: 'session-1', eventType: 'page_view', path: '/a' })

        const purged = await repository.purgeEventsOlderThan(FUTURE, 100)

        expect(isOk(purged)).toBe(true)
        if (isOk(purged)) expect(purged.value).toBe(1)
      })

      it('honours the batch size rather than deleting everything at once', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        for (let i = 0; i < 5; i++) {
          await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: `/a/${i}` })
        }

        const first = await repository.purgeEventsOlderThan(FUTURE, 2)

        // A purge that ignored the batch size would take one long lock over the
        // whole backlog; the cron is written to call back until a pass is empty.
        if (isOk(first)) expect(first.value).toBe(2)

        const second = await repository.purgeEventsOlderThan(FUTURE, 2)
        if (isOk(second)) expect(second.value).toBe(2)
      })

      it('purges sessions past the cutoff', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const purged = await repository.purgeSessionsOlderThan(FUTURE, 100)

        if (isOk(purged)) expect(purged.value).toBe(1)

        const gone = await repository.findSessionBySessionId('session-1')
        // Counting a deletion is not the same as performing one; assert the row
        // is actually unreachable afterwards.
        if (isOk(gone)) expect(gone.value).toBeNull()
      })

      it('honours the batch size for sessions too', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedSession('session-2', 'visitor-1')
        await seedSession('session-3', 'visitor-1')

        const purged = await repository.purgeSessionsOlderThan(FUTURE, 2)

        if (isOk(purged)) expect(purged.value).toBe(2)
      })

      it('honours the batch size for visitors too', async () => {
        await seedVisitor('visitor-1')
        await seedVisitor('visitor-2')
        await seedVisitor('visitor-3')

        const purged = await repository.purgeVisitorsInactiveSince(FUTURE, 2)

        if (isOk(purged)) expect(purged.value).toBe(2)
      })

      it('purges inactive visitors and takes their sessions with them', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')

        const purged = await repository.purgeVisitorsInactiveSince(FUTURE, 100)

        if (isOk(purged)) expect(purged.value).toBe(1)

        const session = await repository.findSessionBySessionId('session-1')
        if (isOk(session)) expect(session.value).toBeNull()
      })
    })
    describe('reads for the dashboard', () => {
      async function seedRead(path: string, durationMs: number | null) {
        await repository.createEvent({
          sessionId: 'session-1',
          eventType: durationMs === null ? 'page_view' : 'page_exit',
          path,
          durationMs,
          scrollDepth: durationMs === null ? null : 70,
        })
      }

      it('returns only pages with a reading measurement', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedRead('/lido', 45_000)
        await seedRead('/apenas-aberto', null)

        const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 50, cursor: null })

        // "Which pages did they READ" is the question. A page_view with no
        // duration records that a URL was requested, which is the metric this
        // whole design exists to move beyond.
        if (isOk(pages)) {
          expect(pages.value).toHaveLength(1)
          expect(pages.value[0].path).toBe('/lido')
        }
      })

      it('never returns another visitor’s pages', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedRead('/meu', 1000)

        await seedVisitor('visitor-2')
        await seedSession('session-2', 'visitor-2')
        await repository.createEvent({
          sessionId: 'session-2',
          eventType: 'page_exit',
          path: '/alheio',
          durationMs: 1000,
        })

        const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 50, cursor: null })

        if (isOk(pages)) {
          expect(pages.value).toHaveLength(1)
          expect(pages.value[0].path).toBe('/meu')
        }
      })

      it('honours the page limit', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedRead('/um', 1000)
        await seedRead('/dois', 2000)
        await seedRead('/tres', 3000)

        const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 2, cursor: null })

        if (isOk(pages)) expect(pages.value).toHaveLength(2)
      })

      it('pages through reading history with the cursor', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedRead('/um', 1000)
        await seedRead('/dois', 2000)
        await seedRead('/tres', 3000)

        const firstPage = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 2, cursor: null })
        if (!isOk(firstPage)) throw new Error('setup: primeira página falhou')

        const cursor = firstPage.value[firstPage.value.length - 1].occurredAt
        const secondPage = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 2, cursor })

        if (isOk(secondPage)) {
          const firstPaths = firstPage.value.map((e) => e.path)
          const secondPaths = secondPage.value.map((e) => e.path)

          // The pages must not overlap. A cursor that is ignored — or compared
          // with the wrong operator — silently re-serves rows the client already
          // has, and the client cannot tell.
          expect(secondPaths.some((path) => firstPaths.includes(path))).toBe(false)
        }
      })

      it('returns nothing past the end of the history', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedRead('/um', 1000)

        const firstPage = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 10, cursor: null })
        if (!isOk(firstPage)) throw new Error('setup: primeira página falhou')

        const past = await repository.findPagesRead({
          visitorId: 'visitor-1',
          limit: 10,
          cursor: firstPage.value[0].occurredAt,
        })

        if (isOk(past)) expect(past.value).toEqual([])
      })

      it('honours the limit on visits', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedSession('session-2', 'visitor-1')
        await seedSession('session-3', 'visitor-1')

        const visits = await repository.findVisits('visitor-1', 2)

        if (isOk(visits)) expect(visits.value).toHaveLength(2)
      })

      it('honours the limit on visitors by user', async () => {
        const userId = await setup.createLinkableUser()

        await seedVisitor('visitor-1', { userId })
        await seedVisitor('visitor-2', { userId })
        await seedVisitor('visitor-3', { userId })

        const found = await repository.findVisitorsByUserId(userId, 2)

        if (isOk(found)) expect(found.value).toHaveLength(2)
      })

      it('answers an empty list for a visitor who read nothing', async () => {
        await seedVisitor('visitor-1')

        const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 50, cursor: null })

        expect(isOk(pages)).toBe(true)
        if (isOk(pages)) expect(pages.value).toEqual([])
      })

      it('returns this visitor’s visits', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedSession('session-2', 'visitor-1')

        const visits = await repository.findVisits('visitor-1', 50)

        if (isOk(visits)) expect(visits.value).toHaveLength(2)
      })

      it('never returns another visitor’s visits', async () => {
        await seedVisitor('visitor-1')
        await seedSession('session-1', 'visitor-1')
        await seedVisitor('visitor-2')
        await seedSession('session-2', 'visitor-2')

        const visits = await repository.findVisits('visitor-1', 50)

        if (isOk(visits)) {
          expect(visits.value).toHaveLength(1)
          expect(visits.value[0].sessionId).toBe('session-1')
        }
      })

      it('finds the visitors linked to a user', async () => {
        const userId = await setup.createLinkableUser()

        await seedVisitor('visitor-1', { userId })
        await seedVisitor('visitor-2', { userId })
        await seedVisitor('visitor-anon')

        const found = await repository.findVisitorsByUserId(userId, 50)

        if (isOk(found)) expect(found.value).toHaveLength(2)
      })

      it('answers an empty list for a user with no linked visitors', async () => {
        const userId = await setup.createLinkableUser()

        const found = await repository.findVisitorsByUserId(userId, 50)

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toEqual([])
      })
    })
  })
}
