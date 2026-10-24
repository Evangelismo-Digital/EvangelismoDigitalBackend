import { Counter } from 'prom-client'
import { getRegistry } from './index'

const registry = getRegistry()

/**
 * Rows removed by the retention sweep, labelled by table.
 *
 * A retention job that silently stops working looks exactly like one with
 * nothing to do — both delete zero rows. The counter is what makes the
 * difference visible on a dashboard, and it is the reason a job handler in this
 * repo is required to assert its counter moved.
 */
export const collectMetricsAnalyticsRetentionDeleted = registry
  ? new Counter({
      name: 'analytics_retention_deleted_total',
      help: 'Analytics rows deleted by the retention sweep',
      labelNames: ['table'] as const,
      registers: [registry],
    })
  : null

/** Retention sweep runs, whatever their outcome. */
export const collectMetricsAnalyticsRetentionRuns = registry
  ? new Counter({
      name: 'analytics_retention_runs_total',
      help: 'Analytics retention sweep executions',
      registers: [registry],
    })
  : null

/**
 * Signed analytics cookies that verified against a SUPERSEDED secret.
 *
 * `@fastify/cookie` reports this as `renew: true` from `unsignCookie` — the
 * cookie is valid, but it was signed with `COOKIE_SECRET_PREVIOUS` rather than
 * the current key. The code used to discard that flag.
 *
 * Re-signing itself needs no help: `POST /analytics/session` re-issues both
 * cookies with `signed: true` on every call, and the library always signs with
 * the first secret, so a returning visitor is moved onto the current key by
 * their next page load. What was missing is knowing WHEN that has finished.
 *
 * Removing `COOKIE_SECRET_PREVIOUS` invalidates every cookie still signed with
 * it, and without this counter there is no way to tell whether that is zero
 * visitors or a large fraction of them — the rotation window would be closed on
 * a guess. It reaching and staying at zero is the evidence that it is safe.
 */
export const collectMetricsAnalyticsCookieSupersededSecret = registry
  ? new Counter({
      name: 'analytics_cookie_superseded_secret_total',
      help: 'Signed analytics cookies presented that verified against a rotated-out secret',
      labelNames: ['cookie'] as const,
      registers: [registry],
    })
  : null
