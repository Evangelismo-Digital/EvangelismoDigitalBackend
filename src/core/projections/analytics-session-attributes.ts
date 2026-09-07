import { UpsertSessionInput } from 'core/contracts/repository/analytics-repository.interface'

/**
 * The attributes an analytics session upsert writes, normalised.
 *
 * This lived twice, byte-identical, in `PrismaAnalyticsRepository` and
 * `InMemoryAnalyticsRepository` — and the in-memory copy carried a comment
 * saying exactly why that was dangerous: *"A divergence here would make a unit
 * test agree with a production path that does something else."* Two copies is
 * how that divergence happens, so the definition is now singular and both
 * repositories derive from it.
 *
 * It belongs in `core` because *which* attributes a session carries is a fact
 * about the domain contract (`UpsertSessionInput`), not about how either
 * implementation stores them. The doubles remain independent where it matters —
 * storage semantics — while agreeing on the field list by construction.
 *
 * `?? null` rather than leaving values undefined: the column is nullable, and
 * an absent UTM parameter must clear a previously stored one on update rather
 * than silently preserve it.
 */
const OPTIONAL_SESSION_FIELDS = [
  'ipAddress',
  'userAgent',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
] as const

type OptionalSessionField = (typeof OPTIONAL_SESSION_FIELDS)[number]

export function toSessionAttributes(
  data: UpsertSessionInput,
): { visitorId: string } & Record<OptionalSessionField, string | null> {
  const optional = Object.fromEntries(OPTIONAL_SESSION_FIELDS.map((field) => [field, data[field] ?? null])) as Record<
    OptionalSessionField,
    string | null
  >

  return { visitorId: data.visitorId, ...optional }
}
