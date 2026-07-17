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
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().positive().default(2),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(ms('10s')),
  DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(ms('30s')),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_LOG_OUTAGE_INTERVAL_MS: z.coerce.number().int().positive().default(ms('30s')),

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

  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  SENTRY_PROFILE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // SMTP
  SMTP_EMAIL: z.email(),
  SMTP_PASSWORD: z.string().min(1),
  SMTP_PORT: z.coerce.number(),
  SMTP_HOST: z.string().min(1),
  SMTP_SECURE: z.enum(['true', 'false']).transform((val) => val === 'true'),

  // ADMIN EMAIL
  ADMIN_EMAIL: z.email(),

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

  // Stadia API
  STADIA_MAPS_API_URL: z.url().default('https://api.stadiamaps.com/route/v1'),
  STADIA_MAPS_MATRIX_API_URL: z.url().default('https://api.stadiamaps.com/sources_to_targets'),
  STADIA_API_TOKEN: z.string().min(1, 'STADIA_API_TOKEN is required'),
  COOKIE_SECRET: z
    .string()
    .min(32, 'Cookie secret must be at least 32 characters long')
    .default('super-secret-cookie-signing-key-for-local-development-must-be-long'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('Variáveis de ambiente inválidas:', z.treeifyError(_env.error))

  throw new Error(ENV_CONSTANTS.INVALID_VARIABLES)
}

export const env = _env.data
