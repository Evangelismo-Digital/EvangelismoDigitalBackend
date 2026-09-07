import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'

/**
 * A church as it may be shown outside this system.
 *
 * The distinction from {@link NearbyChurch} is one field: `id`, the database
 * primary key, which never leaves the process. That is a domain rule about what
 * this system is willing to disclose — not a formatting decision — so it lives
 * in `core`, where both the use-cases and the HTTP presenter can depend on it.
 *
 * It used to live only in `ChurchPresenter` under `@http/presenters`, which
 * forced `FindNearestChurchesUseCase` to import from the HTTP layer to obey a
 * rule that is really its own. The dependency pointed outward, and the
 * invariant looked like presentation.
 */
export interface PublicNearbyChurch {
  publicId: string
  name: string
  address: string | null
  lat: number
  lon: number
  distanceKm: number
  distanceMeters: number
}

/** Drops the internal `id`; every other field is carried through unchanged. */
export function toPublicNearbyChurch(church: NearbyChurch): PublicNearbyChurch {
  return {
    publicId: church.publicId,
    name: church.name,
    address: church.address,
    lat: church.lat,
    lon: church.lon,
    distanceKm: church.distanceKm,
    distanceMeters: church.distanceMeters,
  }
}

export function toPublicNearbyChurches(churches: NearbyChurch[]): PublicNearbyChurch[] {
  return churches.map(toPublicNearbyChurch)
}
