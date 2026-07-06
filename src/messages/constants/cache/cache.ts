export const CACHE_CONFIG = {
  CEP_COORDS: {
    PREFIX: 'cache:cep-coords:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30, // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 25_000,
  },
  NEAREST_CHURCHES: {
    PREFIX: 'cache:nearest-churches:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30, // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 25_000,
  },
  STADIA_ROUTE: {
    PREFIX: 'cache:stadia-route-distance:',
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7, // 7 days
    NEGATIVE_TTL_SECONDS: 0,
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 2_500,
    TTL_JITTER_PERCENTAGE: 0.05,
  },
  /** Defaults internos do ResilientChurchRoutingProviderDecorator (quando nenhum override é passado) */
  STADIA_ROUTE_DECORATOR_DEFAULTS: {
    PREFIX: 'cache:stadia-route-distance:',
    DEFAULT_TTL_SECONDS: 60 * 60, // 1 hour (fallback do decorator)
    NEGATIVE_TTL_SECONDS: 0,
    MAX_PENDING_FETCHES: 500,
    TTL_JITTER_PERCENTAGE: 0.05,
  },
} as const
