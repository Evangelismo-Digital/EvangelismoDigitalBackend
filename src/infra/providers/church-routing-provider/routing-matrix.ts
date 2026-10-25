import { RouteDistanceResult } from '@infra/providers/interfaces/church-routing-provider.interface'
import {
  UPSTREAM_STATUS,
  UPSTREAM_SUCCESS_MIN,
  UPSTREAM_SUCCESS_MAX_EXCLUSIVE,
} from '@common/constants/upstream-http-status'

/**
 * What every matrix-based routing provider does with its answer, once the
 * vendor-specific envelope has been unwrapped.
 *
 * Geoapify and OpenRouteService disagree on the request and response shapes but
 * agree on what the answer means: a 404 is "nothing reachable", a missing entry
 * is "this destination is unreachable", and the caller zips the result against
 * its church list, so it must always have one row per destination.
 */

/**
 * A 404 is a real answer for a matrix ("nothing reachable"), not a transport
 * failure, so axios must not throw on it.
 */
export function acceptsMatrixStatus(status: number): boolean {
  return (
    (status >= UPSTREAM_SUCCESS_MIN && status < UPSTREAM_SUCCESS_MAX_EXCLUSIVE) || status === UPSTREAM_STATUS.NOT_FOUND
  )
}

/** Every destination marked unreachable. */
export function allUnreachable(destinationCount: number): RouteDistanceResult[] {
  return Array.from({ length: destinationCount }, () => ({ distance: null, status: UPSTREAM_STATUS.NOT_FOUND }))
}

/**
 * One result per destination, treating a missing or null distance as
 * unreachable rather than as an error or a zero-length route.
 */
export function readDistanceRow(
  distances: ReadonlyArray<number | null | undefined> | undefined,
  destinationCount: number,
): RouteDistanceResult[] {
  return Array.from({ length: destinationCount }, (_, index) => ({ distance: distances?.[index] ?? null, status: 0 }))
}
