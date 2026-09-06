import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

/**
 * How far a church may be, by *routed* distance, before it stops being a useful
 * answer to "where is my nearest church?".
 *
 * Routed rather than straight-line, because the two diverge sharply in the
 * cases that matter: a church 5km across a river can be a 30km walk. The
 * ceiling is per profile because the same number means very different things —
 * 50km is an implausible walk and an unremarkable drive.
 *
 * Typed as a total Record so adding a RoutingProfile is a compile error here
 * rather than a silent fallback to somebody else's ceiling.
 */
export const ROUTING_MAX_DISTANCE_KM: Record<RoutingProfile, number> = {
  [RoutingProfile.PEDESTRIAN]: 10,
  [RoutingProfile.BIKESHARE]: 30,
  [RoutingProfile.BICYCLE]: 50,
  [RoutingProfile.LOW_SPEED_VEHICLE]: 50,
  [RoutingProfile.MOTOR_SCOOTER]: 100,
  [RoutingProfile.AUTO]: 150,
  [RoutingProfile.TAXI]: 150,
  [RoutingProfile.MOTORCYCLE]: 150,
  [RoutingProfile.BUS]: 150,
  [RoutingProfile.TRUCK]: 150,
}

export const CHURCH_CONSTANTS = {
  KNN_LIMIT: 5,

  /**
   * Ceiling for the PostGIS nearest-neighbour query.
   *
   * The index-backed search runs in tens of milliseconds; a second is generous
   * enough that only a genuinely unhealthy database hits it, and short enough
   * that it cannot eat a meaningful share of the request budget. Narrowed
   * further whenever less than a second of budget remains.
   */
  KNN_BUDGET_MS: 1_000,
  GEOCODING_COUNTRY: 'Brazil',
  UNKNOWN_PROVIDER: 'Unknown',
} as const
