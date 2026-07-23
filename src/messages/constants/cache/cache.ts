export const CACHE_CONFIG = {
  CEP_COORDS: {
    PREFIX: 'cache:cep-coords:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30, // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 10_000,
  },
  NEAREST_CHURCHES: {
    PREFIX: 'cache:nearest-churches:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30, // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 15_000,
  },
} as const
