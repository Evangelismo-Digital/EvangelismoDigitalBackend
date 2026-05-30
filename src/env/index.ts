import { z } from 'zod'
import ms from 'ms'

process.loadEnvFile?.('.env')

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

  // App
  APP_NAME: z.string().default('Backend Template Reborn'),
  APP_PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(60, 'JWT secret must be at least 60 characters long'),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  HASH_SALT_ROUNDS: z.coerce.number().default(12),

  SENTRY_DSN: z.string().optional(),

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
  STADIA_API_TOKEN: z.string().min(1, 'STADIA_API_TOKEN is required'),
})

const _env = envSchema.safeParse(process.env)

if (!_env.success) {
  console.error('Invalid environment variables:', z.treeifyError(_env.error))

  throw new Error('Invalid environment variables. Please check your .env file or environment configuration.')
}

export const env = _env.data
