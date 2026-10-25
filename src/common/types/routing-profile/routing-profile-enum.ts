/**
 * How the caller is travelling. These are the only two modes the public API
 * offers (`?mode=`), so the string values double as the API contract; each
 * provider maps them onto its own vocabulary.
 */
export enum RoutingProfile {
  PEDESTRIAN = 'pedestrian',
  /** Car / motor vehicle. */
  TRANSPORT = 'transport',
}
