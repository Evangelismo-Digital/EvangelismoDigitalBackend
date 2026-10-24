/**
 * Time conversion factors.
 *
 * `60 * 60 * 24 * 7` is readable in isolation and unreadable in a diff: the
 * reviewer has to multiply it out before they can tell whether the number
 * changed from a week to a day. Spelling the chain out — `SECONDS_PER_DAY *
 * DAYS_PER_WEEK` — makes the unit part of the expression instead of part of a
 * trailing comment that the next edit will not update.
 */
export const SECONDS_PER_MINUTE = 60
export const DAYS_PER_WEEK = 7
export const DAYS_PER_YEAR = 365

// Intermediate factors, not exported: nothing outside this module needs them,
// and an unused export is dead code the moment it stops being used here.
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

export const SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY
