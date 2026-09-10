import {
  CreateEventInput,
  UpsertSessionInput,
  UpsertVisitorInput,
} from 'core/contracts/repository/analytics-repository.interface'

/**
 * The attributes an analytics upsert writes, normalised.
 *
 * These lived twice, byte-identical, in `PrismaAnalyticsRepository` and
 * `InMemoryAnalyticsRepository` — and the in-memory copy carried a comment
 * saying exactly why that was dangerous: *"A divergence here would make a unit
 * test agree with a production path that does something else."* Two copies is
 * how that divergence happens, so the definition is singular and both
 * repositories derive from it.
 *
 * It belongs in `core` because *which* attributes a session carries is a fact
 * about the domain contract, not about how either implementation stores them.
 * The doubles stay independent where it matters — storage semantics — while
 * agreeing on the field list by construction.
 *
 * `?? null` rather than leaving values undefined: the columns are nullable, and
 * an absent UTM parameter must CLEAR a previously stored one on update rather
 * than silently preserve it.
 */

const OPTIONAL_SESSION_FIELDS = [
  'userId',
  'ipAddress',
  'browser',
  'os',
  'device',
  'language',
  'referrer',
  'landingPath',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
] as const

type OptionalSessionField = (typeof OPTIONAL_SESSION_FIELDS)[number]

export type SessionAttributes = { visitorId: string } & Record<OptionalSessionField, string | null>

export function toSessionAttributes(data: UpsertSessionInput): SessionAttributes {
  const optional = Object.fromEntries(OPTIONAL_SESSION_FIELDS.map((field) => [field, data[field] ?? null])) as Record<
    OptionalSessionField,
    string | null
  >

  return { visitorId: data.visitorId, ...optional }
}

/**
 * First-touch fields, applied ONLY on create.
 *
 * Separated from the update path deliberately: the whole value of first-touch
 * attribution is that it survives every later campaign, so these must never
 * appear in an update payload.
 */
const FIRST_TOUCH_FIELDS = ['firstUtmSource', 'firstUtmMedium', 'firstUtmCampaign', 'firstLandingPath'] as const

type FirstTouchField = (typeof FIRST_TOUCH_FIELDS)[number]

export type VisitorCreateAttributes = { visitorId: string; userId: string | null } & Record<
  FirstTouchField,
  string | null
>

export function toVisitorCreateAttributes(data: UpsertVisitorInput): VisitorCreateAttributes {
  const firstTouch = Object.fromEntries(FIRST_TOUCH_FIELDS.map((field) => [field, data[field] ?? null])) as Record<
    FirstTouchField,
    string | null
  >

  return { visitorId: data.visitorId, userId: data.userId ?? null, ...firstTouch }
}

/**
 * The nullable columns of an event, normalised.
 *
 * Extracted for the same reason as the session projection — both repositories
 * were normalising the identical five fields — and it also keeps `createEvent`
 * under the complexity ceiling: a chain of `?? null` reads as one expression but
 * counts as one branch each.
 *
 * `durationMs` and `scrollDepth` must reach `null` and never `0`: zero is a real
 * reading ("stayed 0 ms, scrolled 0 %") and conflating it with "not measured"
 * would quietly poison every average built on these columns.
 */
export interface EventAttributes {
  title: string | null
  referrer: string | null
  durationMs: number | null
  scrollDepth: number | null
}

export function toEventAttributes(data: CreateEventInput): EventAttributes {
  return {
    title: data.title ?? null,
    referrer: data.referrer ?? null,
    durationMs: data.durationMs ?? null,
    scrollDepth: data.scrollDepth ?? null,
  }
}
