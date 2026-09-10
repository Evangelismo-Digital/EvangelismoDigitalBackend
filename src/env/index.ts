import 'dotenv/config'
import { z } from 'zod'
import ms from 'ms'
import { ENV_CONSTANTS } from '../messages/constants/env/env'

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.url(),
  DATABASE_URL_LOCAL: z.url().optional(),
  // Only used by `prisma migrate diff`/`migrate dev` (prisma.config.ts); Prisma 7
  // dropped the --shadow-database-url CLI flag, so this must come from config.
  SHADOW_DATABASE_URL: z.url().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().positive().default(2),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(ms('10s')),
  DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(ms('30s')),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_LOG_OUTAGE_INTERVAL_MS: z.coerce.number().int().positive().default(ms('30s')),

  // Health probe for ingress rate limiting. Bounded on both ends deliberately:
  // below a second it becomes traffic against Redis for no extra fidelity, and
  // above five minutes an outage could pass unnoticed between two observations.
  REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS: z.coerce.number().int().min(ms('1s')).max(ms('5m')).default(ms('15s')),

  // Metrics
  METRICS_ENABLED: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(true),
  METRICS_API_PORT: z.coerce.number().default(9091),
  METRICS_WORKER_PORT: z.coerce.number().default(9092),

  // Grafana (used in docker-compose.monitoring.yml)
  GRAFANA_ADMIN_PASSWORD: z.string().min(8),

  // App
  APP_NAME: z.string().default('Backend Template Reborn'),
  APP_PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(60, 'JWT secret must be at least 60 characters long'),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  HASH_SALT_ROUNDS: z.coerce.number().default(12),

  // HTTP rate limits (test overrides supported via env)
  HTTP_RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
  HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_AUTH_SESSION_MAX: z.coerce.number().int().positive().default(15),
  HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_AUTH_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX: z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW: z.string().default('1 hour'),

  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX: z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW: z.string().default('1 hour'),

  HTTP_RATE_LIMIT_USERS_LIST_MAX: z.coerce.number().int().positive().default(20),
  HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW: z.string().default('1 hour'),

  HTTP_RATE_LIMIT_USERS_DELETE_MAX: z.coerce.number().int().positive().default(10),
  HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW: z.string().default('1 hour'),

  HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX: z.coerce.number().int().positive().default(30000),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX: z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_HEALTH_CHECK_MAX: z.coerce.number().int().positive().default(120),
  HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW: z.string().default('1 minute'),

  // Analytics ingestion — tighter than the 300/min global default, because each
  // route has a known shape of legitimate use. `/session` is called once at
  // boot and again on logout; `/identify` once per login; only `/events` is
  // called repeatedly, and it batches up to 50 events per request.
  HTTP_RATE_LIMIT_ANALYTICS_SESSION_MAX: z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_ANALYTICS_SESSION_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_ANALYTICS_EVENTS_MAX: z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_ANALYTICS_EVENTS_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_MAX: z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_TIME_WINDOW: z.string().default('1 minute'),

  HTTP_RATE_LIMIT_ANALYTICS_READ_MAX: z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_ANALYTICS_READ_TIME_WINDOW: z.string().default('1 minute'),

  // Circuit breaker (resilient provider + cache policies)
  // Enabled by default: when off, the policy stack is *composed* without a
  // breaker rather than branching per call, so the flag costs nothing at runtime.
  CIRCUIT_BREAKER_ENABLED: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(true),
  // Fraction of calls that must fail within the sampling window before the
  // circuit opens. Exclusive bounds: 0 would trip on a healthy provider and 1
  // could never trip, so both are configuration mistakes rather than settings.
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().gt(0).lt(1).default(0.5),
  CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: z.coerce.number().int().positive().default(ms('30s')),
  // Minimum throughput before the breaker may open, so a single failure during
  // an idle period cannot suspend a provider.
  CIRCUIT_BREAKER_MIN_THROUGHPUT: z.coerce.number().int().positive().default(5),
  CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: z.coerce.number().int().positive().default(ms('10s')),

  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  SENTRY_PROFILE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // SMTP
  SMTP_EMAIL: z.email(),
  SMTP_PASSWORD: z.string().min(1),
  SMTP_PORT: z.coerce.number(),
  SMTP_HOST: z.string().min(1),
  SMTP_SECURE: z.enum(['true', 'false']).transform((val) => val === 'true'),
  // Timeouts defensivos: impedem que um servidor SMTP travado bloqueie o chamador (padrões do Nodemailer chegam a 10 min)
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // ADMIN EMAIL
  ADMIN_EMAIL: z.email(),

  // Seed data (dev/local only — override for anything beyond a throwaway local DB)
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!SeedAdmin'),

  // Address Providers
  AWESOME_API_URL: z.string(), //Also geocoding provider
  AWESOME_API_TOKEN: z.string().min(1),
  VIACEP_API_URL: z.string(),
  BRASIL_API_URL: z.string(),

  // Geocoding Providers
  // Nominatim (Fallback)
  NOMINATIM_API_URL: z.string(),

  LOCATION_IQ_API_URL: z.string().default('https://us1.locationiq.com/v1'),
  LOCATION_IQ_API_TOKEN: z.string().min(1),

  // Stadia API — only the batch matrix endpoint is called; the single-route
  // endpoint went away with the unused `fetchRawDistance`.
  STADIA_MAPS_MATRIX_API_URL: z.url().default('https://api.stadiamaps.com/sources_to_targets'),
  STADIA_API_TOKEN: z.string().min(1, 'STADIA_API_TOKEN is required'),
  // No `.default(...)`, deliberately. The value that used to sit here was
  // committed to the repository and applied in every NODE_ENV, so forgetting the
  // variable in a deploy did not fail the boot — it silently signed production
  // cookies with a key anyone could read from git history. `JWT_SECRET` above was
  // already declared without a default; this aligns the two.
  COOKIE_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters long'),

  // Rotation window: `@fastify/cookie` signs with the first secret and accepts a
  // signature from any of them, so a new key can be deployed without
  // invalidating the 13-month visitor cookies already in the wild. Promote the
  // current value here, generate a new COOKIE_SECRET, deploy, and drop this one
  // after a window at least as long as the longest-lived cookie.
  // `preprocess` because dotenv reports a declared-but-blank `FOO=` as an empty
  // string, not an absent key — and an operator finishing a rotation blanks the
  // value far more often than they delete the line. Without this, `.min(32)`
  // would run against `''` and refuse to boot over a variable that is, by
  // intent, unset.
  // Shared secret proving a request arrived through the Next.js first-party
  // proxy rather than straight off the internet. The proxy is what makes the
  // analytics cookies first-party at all (see docs/analytics-cookie-architecture
  // §2), so a request that bypasses it is either a misconfiguration or an
  // attempt to write analytics directly — both answered with 401.
  //
  // Required in every NODE_ENV, with no default, for the same reason
  // COOKIE_SECRET is: a gate that silently disables itself when a variable is
  // missing is not a gate. Tests and local tooling send the header explicitly.
  ANALYTICS_PROXY_SECRET: z.string().min(32, 'Analytics proxy secret must be at least 32 characters long'),

  // Whether identity stitching reaches BACKWARDS over a visitor's earlier
  // anonymous sessions. Off by default, and behind a flag because it is a
  // privacy decision rather than a technical one: enabling it retroactively
  // attaches browsing that happened before the person identified themselves.
  // Retention windows (§5.3), in days. Events and sessions outlive the visitor
  // cookie by a month so a visitor's final session is never truncated mid-window;
  // visitors go at the 13-month ceiling the cookie itself uses.
  ANALYTICS_RETENTION_EVENTS_DAYS: z.coerce.number().int().positive().default(425),
  ANALYTICS_RETENTION_SESSIONS_DAYS: z.coerce.number().int().positive().default(425),
  ANALYTICS_RETENTION_VISITORS_DAYS: z.coerce.number().int().positive().default(395),

  ANALYTICS_BACKFILL_IDENTITY: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),

  COOKIE_SECRET_PREVIOUS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, 'Previous cookie secret must be at least 32 characters long').optional(),
  ),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  // `process.stderr`, not `console`: this runs at import time and the logger
  // itself imports this module, so there is no logger to report through yet.
  process.stderr.write(`Variáveis de ambiente inválidas: ${JSON.stringify(z.treeifyError(_env.error), null, 2)}\n`)

  throw new Error(ENV_CONSTANTS.INVALID_VARIABLES)
}

export const env = _env.data

/** The validated environment's shape, for modules that take one of its fields. */
export type Env = typeof env
