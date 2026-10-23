/**
 * Geographic constants shared by the coordinate validators, the haversine
 * distance calculation and the repositories that round coordinates.
 *
 * They were spelled as literals in five places — `180` appeared as a longitude
 * bound in one file and as half a turn in degrees in the next, two unrelated
 * meanings a reader has to tell apart by context. Named once, the difference is
 * on the page.
 */

/** WGS 84 latitude range, in degrees. */
export const MIN_LATITUDE = -90
export const MAX_LATITUDE = 90

/** WGS 84 longitude range, in degrees. */
export const MIN_LONGITUDE = -180
export const MAX_LONGITUDE = 180

/** Degrees in a half turn — the denominator of the radian conversion. */
const DEGREES_IN_HALF_TURN = 180

/** Multiplier that converts degrees to radians (π / 180°). */
export const DEGREES_TO_RADIANS = Math.PI / DEGREES_IN_HALF_TURN

/** Mean Earth radius in metres, as used by the haversine formula. */
export const EARTH_RADIUS_METERS = 6_371_000

export const METERS_PER_KILOMETER = 1000

/**
 * Decimal places kept when storing a coordinate.
 *
 * Six places is ~0.11 m at the equator — finer than any consumer-grade GPS fix,
 * and the precision the Prisma repository already rounds to. The in-memory
 * double must round identically or the shared repository contract fails on the
 * double and passes on the real one.
 */
export const COORDINATE_DECIMAL_PLACES = 6

/**
 * Decimal places kept on a computed distance.
 *
 * Deliberately generous: the value is compared against PostGIS's own result in
 * the repository contract, and rounding it further would hide a real divergence
 * between the two implementations rather than a floating-point tail.
 */
export const DISTANCE_DECIMAL_PLACES = 15
