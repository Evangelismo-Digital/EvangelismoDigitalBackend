export const CACHE_CONFIG = {
  /**
   * The single cache layer for the "find the nearest church" flow. Keyed by
   * CEP + routing profile and holding the finished church list — never
   * intermediate coordinates. FETCH_TIMEOUT_MS is the budget for the entire
   * chain (address -> geocode -> KNN -> routing matrix).
   */
  NEAREST_CHURCHES: {
    PREFIX: 'cache:nearest-churches:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days

    /**
     * The CEP could not be resolved to coordinates (NOT_FOUND). This is the
     * negative cache that shields the address/geocoding APIs — ViaCEP,
     * BrasilAPI, AwesomeAPI, LocationIQ, Nominatim — from being re-asked about
     * a CEP that does not exist. A nonexistent CEP stays nonexistent, so this
     * is deliberately long; a day still lets a newly registered CEP through.
     */
    NOT_FOUND_TTL_SECONDS: 60 * 60 * 24, // 24 hours

    /**
     * Coordinates resolved fine, but no church qualifies (PERMANENT). This
     * depends on our own database rather than a third-party API, so it is kept
     * short: a newly registered church shows up within half an hour.
     */
    PERMANENT_TTL_SECONDS: 60 * 30, // 30 min

    /** Fallback for any other cacheable failure. */
    NEGATIVE_TTL_SECONDS: 60 * 30, // 30 min

    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 15_000,
  },
} as const
