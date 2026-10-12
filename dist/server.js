"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/sentry/init.ts
var import_node = require("@sentry/node");
var import_profiling_node = require("@sentry/profiling-node");

// src/env/index.ts
var import_config = require("dotenv/config");
var import_zod2 = require("zod");
var import_ms = __toESM(require("ms"));

// src/messages/constants/env/env.ts
var ENV_CONSTANTS = {
  INVALID_VARIABLES: "Invalid environment variables. Please check your .env file or environment configuration."
};

// src/env/optional-env.ts
var import_zod = require("zod");
function optionalEnv(schema) {
  return import_zod.z.preprocess((value) => value === "" ? void 0 : value, schema.optional());
}

// src/env/index.ts
var envSchema = import_zod2.z.object({
  // Environment
  NODE_ENV: import_zod2.z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: import_zod2.z.enum(["info", "debug", "warn", "error", "trace"]).default("info"),
  // Database
  DATABASE_URL: import_zod2.z.url(),
  DATABASE_URL_LOCAL: optionalEnv(import_zod2.z.url()),
  // Only used by `prisma migrate diff`/`migrate dev` (prisma.config.ts); Prisma 7
  // dropped the --shadow-database-url CLI flag, so this must come from config.
  SHADOW_DATABASE_URL: optionalEnv(import_zod2.z.url()),
  DB_POOL_MAX: import_zod2.z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: import_zod2.z.coerce.number().int().positive().default(2),
  DB_CONNECTION_TIMEOUT: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("10s")),
  DB_IDLE_TIMEOUT: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  // Redis
  REDIS_HOST: import_zod2.z.string().default("localhost"),
  REDIS_PORT: import_zod2.z.coerce.number().default(6379),
  REDIS_PASSWORD: optionalEnv(import_zod2.z.string()),
  REDIS_LOG_OUTAGE_INTERVAL_MS: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  // Health probe for ingress rate limiting. Bounded on both ends deliberately:
  // below a second it becomes traffic against Redis for no extra fidelity, and
  // above five minutes an outage could pass unnoticed between two observations.
  REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS: import_zod2.z.coerce.number().int().min((0, import_ms.default)("1s")).max((0, import_ms.default)("5m")).default((0, import_ms.default)("15s")),
  // Metrics
  METRICS_ENABLED: import_zod2.z.enum(["true", "false"]).transform((v) => v === "true").default(true),
  METRICS_API_PORT: import_zod2.z.coerce.number().default(9091),
  METRICS_WORKER_PORT: import_zod2.z.coerce.number().default(9092),
  // Grafana (used in docker-compose.monitoring.yml)
  GRAFANA_ADMIN_PASSWORD: import_zod2.z.string().min(8),
  // App
  APP_NAME: import_zod2.z.string().default("Backend Template Reborn"),
  APP_PORT: import_zod2.z.coerce.number().default(3e3),
  JWT_SECRET: import_zod2.z.string().min(60, "JWT secret must be at least 60 characters long"),
  FRONTEND_URL: import_zod2.z.url().default("http://localhost:5173"),
  HASH_SALT_ROUNDS: import_zod2.z.coerce.number().default(12),
  // HTTP rate limits (test overrides supported via env)
  HTTP_RATE_LIMIT_GLOBAL_MAX: import_zod2.z.coerce.number().int().positive().default(300),
  HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_SESSION_MAX: import_zod2.z.coerce.number().int().positive().default(15),
  HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_REGISTER_MAX: import_zod2.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX: import_zod2.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW: import_zod2.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX: import_zod2.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW: import_zod2.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_USERS_LIST_MAX: import_zod2.z.coerce.number().int().positive().default(20),
  HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW: import_zod2.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_USERS_DELETE_MAX: import_zod2.z.coerce.number().int().positive().default(10),
  HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW: import_zod2.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX: import_zod2.z.coerce.number().int().positive().default(3e4),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX: import_zod2.z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_HEALTH_CHECK_MAX: import_zod2.z.coerce.number().int().positive().default(120),
  HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  // Analytics ingestion — tighter than the 300/min global default, because each
  // route has a known shape of legitimate use. `/session` is called once at
  // boot and again on logout; `/identify` once per login; only `/events` is
  // called repeatedly, and it batches up to 50 events per request.
  HTTP_RATE_LIMIT_ANALYTICS_SESSION_MAX: import_zod2.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_ANALYTICS_SESSION_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_ANALYTICS_EVENTS_MAX: import_zod2.z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_ANALYTICS_EVENTS_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_MAX: import_zod2.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_ANALYTICS_READ_MAX: import_zod2.z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_ANALYTICS_READ_TIME_WINDOW: import_zod2.z.string().default("1 minute"),
  // Circuit breaker (resilient provider + cache policies)
  // Enabled by default: when off, the policy stack is *composed* without a
  // breaker rather than branching per call, so the flag costs nothing at runtime.
  CIRCUIT_BREAKER_ENABLED: import_zod2.z.enum(["true", "false"]).transform((v) => v === "true").default(true),
  // Fraction of calls that must fail within the sampling window before the
  // circuit opens. Exclusive bounds: 0 would trip on a healthy provider and 1
  // could never trip, so both are configuration mistakes rather than settings.
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: import_zod2.z.coerce.number().gt(0).lt(1).default(0.5),
  CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  // Minimum throughput before the breaker may open, so a single failure during
  // an idle period cannot suspend a provider.
  CIRCUIT_BREAKER_MIN_THROUGHPUT: import_zod2.z.coerce.number().int().positive().default(5),
  CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("10s")),
  SENTRY_DSN: optionalEnv(import_zod2.z.string()),
  SENTRY_TRACES_SAMPLE_RATE: import_zod2.z.coerce.number().min(0).max(1).default(0.2),
  SENTRY_PROFILE_SAMPLE_RATE: import_zod2.z.coerce.number().min(0).max(1).default(0.1),
  // SMTP
  SMTP_EMAIL: import_zod2.z.email(),
  SMTP_PASSWORD: import_zod2.z.string().min(1),
  SMTP_PORT: import_zod2.z.coerce.number(),
  SMTP_HOST: import_zod2.z.string().min(1),
  SMTP_SECURE: import_zod2.z.enum(["true", "false"]).transform((val) => val === "true"),
  // Pooling do nodemailer. Os limites são conservadores de propósito: o alvo é
  // o SMTP do Gmail, e estourar a cota de envio custa a conta, não só o lote.
  SMTP_POOL_MAX_CONNECTIONS: import_zod2.z.coerce.number().int().positive().default(3),
  SMTP_POOL_MAX_MESSAGES: import_zod2.z.coerce.number().int().positive().default(100),
  SMTP_POOL_RATE_LIMIT: import_zod2.z.coerce.number().int().positive().default(5),
  SMTP_POOL_RATE_DELTA_MS: import_zod2.z.coerce.number().int().positive().default(1e3),
  // Timeouts defensivos: impedem que um servidor SMTP travado bloqueie o chamador (padrões do Nodemailer chegam a 10 min)
  // Breaker do SMTP — deliberadamente separado do CIRCUIT_BREAKER_* dos
  // provedores: o perfil de tráfego não tem nada a ver (um punhado de mensagens
  // por minuto contra uma consulta por requisição), então uma janela de
  // amostragem boa para um é errada para o outro. Compartilhar também faria
  // CIRCUIT_BREAKER_ENABLED=false desligar o breaker do e-mail sem querer.
  SMTP_CIRCUIT_BREAKER_ENABLED: import_zod2.z.enum(["true", "false"]).transform((v) => v === "true").default(true),
  SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD: import_zod2.z.coerce.number().gt(0).lt(1).default(0.5),
  SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("60s")),
  // Vazão mínima baixa porque o envio é esporádico: exigir RPS de provedor aqui
  // significaria que o breaker nunca abriria num serviço que manda e-mail aos poucos.
  SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT: import_zod2.z.coerce.number().int().positive().default(2),
  SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: import_zod2.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  SMTP_CONNECTION_TIMEOUT_MS: import_zod2.z.coerce.number().int().positive().default(5e3),
  SMTP_GREETING_TIMEOUT_MS: import_zod2.z.coerce.number().int().positive().default(5e3),
  SMTP_SOCKET_TIMEOUT_MS: import_zod2.z.coerce.number().int().positive().default(1e4),
  // ADMIN EMAIL
  ADMIN_EMAIL: import_zod2.z.email(),
  // Seed data (dev/local only — override for anything beyond a throwaway local DB)
  SEED_ADMIN_PASSWORD: import_zod2.z.string().min(8).default("ChangeMe123!SeedAdmin"),
  // Address Providers
  AWESOME_API_URL: import_zod2.z.string(),
  //Also geocoding provider
  AWESOME_API_TOKEN: import_zod2.z.string().min(1),
  VIACEP_API_URL: import_zod2.z.string(),
  BRASIL_API_URL: import_zod2.z.string(),
  // Geocoding Providers
  // Nominatim (Fallback)
  NOMINATIM_API_URL: import_zod2.z.string(),
  LOCATION_IQ_API_URL: import_zod2.z.string().default("https://us1.locationiq.com/v1"),
  LOCATION_IQ_API_TOKEN: import_zod2.z.string().min(1),
  // Stadia API — only the batch matrix endpoint is called; the single-route
  // endpoint went away with the unused `fetchRawDistance`.
  STADIA_MAPS_MATRIX_API_URL: import_zod2.z.url().default("https://api.stadiamaps.com/sources_to_targets"),
  STADIA_API_TOKEN: import_zod2.z.string().min(1, "STADIA_API_TOKEN is required"),
  // No `.default(...)`, deliberately. The value that used to sit here was
  // committed to the repository and applied in every NODE_ENV, so forgetting the
  // variable in a deploy did not fail the boot — it silently signed production
  // cookies with a key anyone could read from git history. `JWT_SECRET` above was
  // already declared without a default; this aligns the two.
  COOKIE_SECRET: import_zod2.z.string().min(32, "Cookie secret must be at least 32 characters long"),
  // Rotation window: `@fastify/cookie` signs with the first secret and accepts a
  // signature from any of them, so a new key can be deployed without
  // invalidating the 13-month visitor cookies already in the wild. Promote the
  // current value here, generate a new COOKIE_SECRET, deploy, and drop this one
  // after a window at least as long as the longest-lived cookie.
  // `optionalEnv` because an operator finishing a rotation blanks the value far
  // more often than they delete the line, and blank must mean unset.
  // Shared secret proving a request arrived through the Next.js first-party
  // proxy rather than straight off the internet. The proxy is what makes the
  // analytics cookies first-party at all (see docs/analytics-cookie-architecture
  // §2), so a request that bypasses it is either a misconfiguration or an
  // attempt to write analytics directly — both answered with 401.
  //
  // Required in every NODE_ENV, with no default, for the same reason
  // COOKIE_SECRET is: a gate that silently disables itself when a variable is
  // missing is not a gate. Tests and local tooling send the header explicitly.
  ANALYTICS_PROXY_SECRET: import_zod2.z.string().min(32, "Analytics proxy secret must be at least 32 characters long"),
  // Whether identity stitching reaches BACKWARDS over a visitor's earlier
  // anonymous sessions. Off by default, and behind a flag because it is a
  // privacy decision rather than a technical one: enabling it retroactively
  // attaches browsing that happened before the person identified themselves.
  // Retention windows (§5.3), in days. Events and sessions outlive the visitor
  // cookie by a month so a visitor's final session is never truncated mid-window;
  // visitors go at the 13-month ceiling the cookie itself uses.
  ANALYTICS_RETENTION_EVENTS_DAYS: import_zod2.z.coerce.number().int().positive().default(425),
  ANALYTICS_RETENTION_SESSIONS_DAYS: import_zod2.z.coerce.number().int().positive().default(425),
  ANALYTICS_RETENTION_VISITORS_DAYS: import_zod2.z.coerce.number().int().positive().default(395),
  ANALYTICS_BACKFILL_IDENTITY: import_zod2.z.enum(["true", "false"]).transform((v) => v === "true").default(false),
  COOKIE_SECRET_PREVIOUS: optionalEnv(import_zod2.z.string().min(32, "Previous cookie secret must be at least 32 characters long"))
});
var _env = envSchema.safeParse(process.env);
if (!_env.success) {
  process.stderr.write(`Vari\xE1veis de ambiente inv\xE1lidas: ${JSON.stringify(import_zod2.z.treeifyError(_env.error), null, 2)}
`);
  throw new Error(ENV_CONSTANTS.INVALID_VARIABLES);
}
var env = _env.data;

// src/lib/sentry/init.ts
function initSentry() {
  if (!env.SENTRY_DSN) {
    return;
  }
  (0, import_node.init)({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [(0, import_profiling_node.nodeProfilingIntegration)()],
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profileSessionSampleRate: env.SENTRY_PROFILE_SAMPLE_RATE,
    profileLifecycle: "trace"
  });
}

// src/app.ts
var import_fastify = __toESM(require("fastify"));

// src/lib/async-local-storage/index.ts
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();

// src/messages/errors/system.ts
var SYSTEM_ERRORS = {
  ASYNC_LOCAL_STORAGE_NOT_INITIALIZED: {
    code: "ASYNC_LOCAL_STORAGE_NOT_INITIALIZED",
    message: "Async Local Storage is not initialized."
  }
};

// src/errors/app-error.ts
var AppError = class extends Error {
  type;
  body;
  /**
   * Machine-readable routing hint used by resilient fallback chains and cache
   * managers.  Subclasses that participate in fallback/caching declare their
   * own failure mode once; callers never need `instanceof` to branch on it.
   */
  failureMode;
  /**
   * Self-describing observability tag, parallel to `failureMode` but for metric
   * labels. Subclasses declare their own reason once; consumers read it without
   * `instanceof`. See {@link TelemetryReason}.
   */
  telemetryReason;
  /**
   * @param detail         – the error descriptor (code + message + optional extras)
   * @param type           – the HTTP-level error type
   * @param failureMode    – optional routing failure mode (RETRYABLE | NOT_FOUND)
   * @param telemetryReason – optional observability reason for metric labels
   */
  constructor(detail, type, failureMode, telemetryReason) {
    super(detail.message);
    this.name = this.constructor.name;
    this.type = type;
    this.failureMode = failureMode;
    this.telemetryReason = telemetryReason;
    this.body = {
      code: detail.code,
      message: detail.message,
      ...detail.issues && { issues: detail.issues }
    };
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/errors/system-error.ts
var SystemError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type) {
    super(detail, type);
  }
};

// src/lib/errors/async-local-storage/async-local-storage-not-initialized-error.ts
var AsyncLocalStorageNotInitializedError = class extends SystemError {
  constructor() {
    super(SYSTEM_ERRORS.ASYNC_LOCAL_STORAGE_NOT_INITIALIZED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/lib/prisma/index.ts
var import_client = require("@prisma/client");

// src/lib/prisma/helpers/configuration.ts
var import_adapter_pg = require("@prisma/adapter-pg");
var import_pg = require("pg");
var pool = new import_pg.Pool({
  connectionString: env.DATABASE_URL_LOCAL || env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  min: env.DB_POOL_MIN,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT
});
var adapter = new import_adapter_pg.PrismaPg(pool);

// src/lib/prisma/index.ts
var prisma = new import_client.PrismaClient({
  adapter,
  log: env.LOG_LEVEL === "debug" ? ["query", "info", "warn", "error"] : []
});

// src/lib/prisma/helpers/database-context.ts
var DatabaseContext = class {
  constructor(prisma2 = prisma) {
    this.prisma = prisma2;
  }
  prisma;
  get client() {
    const prismaTx = asyncLocalStorage.getStore()?.prismaTransaction;
    return prismaTx ?? this.prisma;
  }
  /**
   * Executes a callback function within a database transaction.
   *
   * This method provides automatic transaction management with the following features:
   * - **Nested transaction support**: If already in a transaction, reuses the existing one
   * - **Automatic rollback**: Rolls back on errors
   * - **Context propagation**: Transaction context is available to all nested calls
   *
   * @template T - The return type of the callback function
   * @param callback - The async function to execute within the transaction
   * @param options - Optional transaction configuration
   * @param options.isolationLevel - The isolation level for the transaction (e.g., 'ReadCommitted', 'Serializable')
   * @param options.maxWait - Maximum time to wait for a transaction slot (in milliseconds)
   * @param options.timeout - Maximum time for the transaction to complete (in milliseconds)
   *
   * @returns A promise that resolves with the callback's return value
   *
   * @throws {AsyncLocalStorageNotInitializedError} When AsyncLocalStorage is not properly initialized
   * @throws {Error} Any error thrown by the callback will cause a rollback and be re-thrown
   * @remarks
   * - When nested, the inner transaction options are ignored and the outer transaction is reused
   * - All database operations within the callback should use `db.client` to participate in the transaction
   * - The transaction will automatically commit if the callback completes successfully
   * - The transaction will automatically rollback if the callback throws an error
   */
  async runInTransaction(callback, options) {
    const store = asyncLocalStorage.getStore();
    if (!store) {
      throw new AsyncLocalStorageNotInitializedError();
    }
    if (store.prismaTransaction) {
      return await callback();
    }
    return await this.prisma.$transaction(async (tx) => {
      return await asyncLocalStorage.run(
        {
          ...store,
          prismaTransaction: tx
        },
        callback
      );
    }, options);
  }
};

// src/core/shared/result.ts
var ok = (value) => ({
  success: true,
  value
});
var err = (error) => ({
  success: false,
  error
});
function isOk(result) {
  return result.success;
}
function isErr(result) {
  return !result.success;
}

// src/core/constants/pagination.ts
var USERS_PAGE_SIZE = 20;

// src/repositories/prisma/prisma-users-repository.ts
var PrismaUsersRepository = class {
  constructor(errorMapper, dbContext = new DatabaseContext()) {
    this.errorMapper = errorMapper;
    this.dbContext = dbContext;
  }
  errorMapper;
  dbContext;
  async create(data) {
    try {
      const user = await this.dbContext.client.user.create({
        data: {
          name: data.name,
          email: data.email,
          cpf: data.cpf,
          username: data.username,
          passwordHash: data.passwordHash,
          role: data.role
        }
      });
      return ok(user);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async findBy(where) {
    try {
      const conditions = buildLookupConditions(where);
      if (conditions.length === 0) {
        return ok(null);
      }
      const user = await this.dbContext.client.user.findFirst({
        where: conditions.length === 1 ? conditions[0] : { OR: conditions }
      });
      return ok(user);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async findByToken({ token }) {
    try {
      const user = await this.dbContext.client.user.findFirst({
        where: {
          token
        }
      });
      return ok(user);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async list() {
    try {
      const users = await this.dbContext.client.user.findMany();
      return ok(users);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async search(query, page) {
    try {
      const users = await this.dbContext.client.user.findMany({
        where: {
          name: {
            contains: query,
            mode: "insensitive"
          }
        },
        skip: (page - 1) * USERS_PAGE_SIZE,
        take: USERS_PAGE_SIZE
      });
      return ok(users);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async update(publicId, data) {
    return await this.applyUpdate(publicId, data);
  }
  async updatePassword(publicId, data) {
    return await this.applyUpdate(publicId, data);
  }
  /**
   * The two public methods stay separate because the CONTRACTS differ — one
   * accepts profile fields, the other only a password hash and its reset token,
   * and that distinction is what stops a caller from clearing a password
   * through the profile route. The write itself is the same statement, and
   * having written it twice is how the two drift apart.
   */
  async applyUpdate(publicId, data) {
    try {
      const user = await this.dbContext.client.user.update({
        where: { publicId },
        data
      });
      return ok(user);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async delete(publicId) {
    try {
      const user = await this.dbContext.client.user.delete({
        where: {
          publicId
        }
      });
      return ok(user);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
};
var USER_LOOKUP_FIELDS = ["id", "publicId", "email", "username", "cpf", "token"];
function buildLookupConditions(where) {
  return USER_LOOKUP_FIELDS.filter((field) => where[field] !== void 0).map((field) => ({ [field]: where[field] }));
}

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client2 = require("@prisma/client");

// src/errors/infrastructure-error.ts
var InfrastructureError = class extends AppError {
  originalError;
  constructor(detail, originalError, type = "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */, failureMode, telemetryReason) {
    super(detail, type, failureMode, telemetryReason);
    this.originalError = originalError;
    if (originalError) {
      this.cause = originalError;
    }
  }
};

// src/messages/errors/infrastructure.ts
var INFRA_ERRORS = {
  SERVICE_BUSY: {
    code: "SERVICE_BUSY",
    message: "Servi\xE7o temporariamente indispon\xEDvel devido ao limite de requisi\xE7\xF5es."
  },
  PROVIDER_FAILURE: {
    code: "PROVIDER_FAILURE",
    message: "Falha de sistema ao processar dados no provedor de servi\xE7os externos."
  },
  DATABASE_QUERY_FAILURE: {
    code: "DATABASE_QUERY_FAILURE",
    message: "Falha de sistema ao processar consulta no banco de dados."
  },
  DEADLINE_EXCEEDED: {
    code: "DEADLINE_EXCEEDED",
    message: "O tempo limite total da requisi\xE7\xE3o foi atingido antes da conclus\xE3o da opera\xE7\xE3o."
  },
  CIRCUIT_OPEN: {
    code: "CIRCUIT_OPEN",
    message: "Provedor externo temporariamente suspenso ap\xF3s falhas repetidas."
  },
  SERVICE_OVERLOAD: {
    code: "SERVICE_OVERLOAD",
    message: "N\xFAmero de requisi\xE7\xF5es simult\xE2neas excedeu o limite de maxPendingFetches na mem\xF3ria cache do Redis."
  }
};

// src/errors/infrastructure/database-query-error.ts
var DatabaseQueryError = class extends InfrastructureError {
  constructor(originalError) {
    super(INFRA_ERRORS.DATABASE_QUERY_FAILURE, originalError, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
    this.name = "DatabaseQueryError";
  }
};

// src/core/shared/safe-lookup.ts
function safeLookup(table, key) {
  return Object.hasOwn(table, key) ? table[key] : void 0;
}

// src/lib/prisma/utils/prisma-error-mapper.ts
var PrismaErrorMapper = class {
  constructor(errorMapping) {
    this.errorMapping = errorMapping;
  }
  errorMapping;
  mapToKnownError(error) {
    if (error instanceof AppError) {
      return error;
    }
    if (error instanceof import_client2.Prisma.PrismaClientKnownRequestError) {
      const errorFactory = safeLookup(this.errorMapping, error.code);
      if (errorFactory) {
        return errorFactory(error);
      }
    }
    return new DatabaseQueryError(error);
  }
};

// src/errors/domain-error.ts
var DomainError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type, failureMode, telemetryReason) {
    super(detail, type, failureMode, telemetryReason);
  }
};

// src/messages/errors/users.ts
var USER_ERRORS = {
  NOT_FOUND: {
    code: "USER_NOT_FOUND",
    message: "Usu\xE1rio n\xE3o encontrado."
  },
  ALREADY_EXISTS: {
    code: "USER_ALREADY_EXISTS",
    message: "Usu\xE1rio j\xE1 existe !"
  },
  NOT_CREATED: {
    code: "USER_NOT_CREATED",
    message: "Falha ao criar o usu\xE1rio."
  },
  NOT_FOUND_FOR_PASSWORD_RESET: {
    code: "USER_NOT_FOUND_FOR_PASSWORD_RESET",
    message: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
  }
};

// src/use-cases/errors/user-already-exists-error.ts
var UserAlreadyExistsError = class extends DomainError {
  constructor() {
    super(USER_ERRORS.ALREADY_EXISTS, "CONFLICT" /* CONFLICT */);
  }
};

// src/use-cases/errors/user-not-found-error.ts
var UserNotFoundError = class extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/repositories/prisma/errors/users-error-mapping.ts
var userPrismaErrorMapping = {
  P2002: () => new UserAlreadyExistsError(),
  // Unique constraint violation (create)
  P2025: () => new UserNotFoundError()
  // Record not found (delete/update)
};

// src/use-cases/users/reset-password.ts
var import_bcryptjs = require("bcryptjs");

// src/messages/errors/auth.ts
var AUTH_ERRORS = {
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "N\xE3o autorizado!"
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "Acesso negado!"
  },
  INVALID_CREDENTIALS: {
    code: "INVALID_CREDENTIALS",
    message: "Credenciais inv\xE1lidas!"
  },
  INVALID_TOKEN: {
    code: "INVALID_TOKEN",
    message: "Token inv\xE1lido ou expirado!"
  },
  PASSWORD_CHANGE_REQUIRED: {
    code: "PASSWORD_CHANGE_REQUIRED",
    message: "\xC9 necess\xE1rio alterar a senha antes de acessar o sistema!"
  }
};

// src/use-cases/errors/invalid-token-error.ts
var InvalidTokenError = class extends DomainError {
  constructor() {
    super(AUTH_ERRORS.INVALID_TOKEN, "UNAUTHORIZED" /* UNAUTHORIZED */);
  }
};

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));
var ERROR_STACK_BREADCRUMB_LINES = 6;
function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId;
}
function getUserId() {
  return asyncLocalStorage.getStore()?.userId;
}
function setUserId(userId) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.userId = userId;
  }
}
var isDev = env.NODE_ENV === "development";
function errSerializer(err2) {
  if (!(err2 instanceof Error)) return err2;
  if (isDev) return import_pino.default.stdSerializers.err(err2);
  const error = err2;
  return {
    name: error.name,
    message: error.message,
    code: error.body?.code ?? error.code,
    type: error.type,
    failureMode: error.failureMode,
    stack: error.stack?.split("\n").slice(0, ERROR_STACK_BREADCRUMB_LINES).join("\n")
  };
}
var baseConfig = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.cpf",
      "*.token",
      "*.rawToken",
      "*.email"
    ],
    censor: "[REDACTED]"
  },
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  mixin() {
    return { requestId: getRequestId(), userId: getUserId() };
  },
  serializers: {
    err: errSerializer,
    error: errSerializer,
    cause: errSerializer
  }
};
var prodStreams = [
  { level: "info", stream: process.stdout },
  { level: "error", stream: process.stderr }
];
var loggerConfig = isDev ? {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname"
    }
  }
} : baseConfig;
var logger = isDev ? (0, import_pino.default)(loggerConfig) : (0, import_pino.default)(baseConfig, (0, import_pino.multistream)(prodStreams));

// src/use-cases/users/helpers/token-hash.ts
var import_node_crypto = require("crypto");
function hashResetToken(rawToken) {
  return (0, import_node_crypto.createHash)("sha256").update(rawToken).digest("hex");
}

// src/use-cases/users/reset-password.ts
var ResetPasswordUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({
    token,
    password
  }) {
    const userResult = await this.usersRepository.findByToken({ token: hashResetToken(token) });
    if (isErr(userResult)) {
      return userResult;
    }
    const userExists = userResult.value;
    if (!userExists) {
      return err(new InvalidTokenError());
    }
    if (!userExists.tokenExpiresAt || userExists.tokenExpiresAt < /* @__PURE__ */ new Date()) {
      await this.discardExpiredToken(userExists.publicId);
      return err(new InvalidTokenError());
    }
    const passwordHash = await (0, import_bcryptjs.hash)(password, env.HASH_SALT_ROUNDS);
    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      passwordHash,
      passwordChangedAt: /* @__PURE__ */ new Date(),
      token: null,
      tokenExpiresAt: null,
      updatedAt: /* @__PURE__ */ new Date()
    });
    if (isErr(updateResult)) {
      return updateResult;
    }
    const user = updateResult.value;
    return ok({ user });
  }
  /**
   * Higiene preguiçosa: um token expirado é limpo na primeira tentativa de uso,
   * em vez de permanecer no banco até o próximo pedido de reset. Best-effort —
   * a falha da limpeza nunca mascara o InvalidTokenError, já que o token
   * continua inválido de qualquer forma.
   */
  async discardExpiredToken(publicId) {
    const cleanupResult = await this.usersRepository.updatePassword(publicId, {
      token: null,
      tokenExpiresAt: null
    });
    if (isErr(cleanupResult)) {
      logger.error(
        { publicId, error: cleanupResult.error },
        "Falha ao limpar token de reset expirado; o token permanece inv\xE1lido e expira naturalmente"
      );
    }
  }
};

// src/use-cases/factories/make-reset-password-use-case.ts
function makeResetPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new ResetPasswordUseCase(usersRepository);
}

// src/http/http-status.ts
var HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// src/errors/http-errors/http-error-status.mapper.ts
var STATUS_MAP = {
  ["OK" /* OK */]: HTTP_STATUS.OK,
  ["BAD_REQUEST" /* BAD_REQUEST */]: HTTP_STATUS.BAD_REQUEST,
  ["UNAUTHORIZED" /* UNAUTHORIZED */]: HTTP_STATUS.UNAUTHORIZED,
  ["FORBIDDEN" /* FORBIDDEN */]: HTTP_STATUS.FORBIDDEN,
  ["NOT_FOUND" /* NOT_FOUND */]: HTTP_STATUS.NOT_FOUND,
  ["CONFLICT" /* CONFLICT */]: HTTP_STATUS.CONFLICT,
  ["UNPROCESSABLE_ENTITY" /* UNPROCESSABLE_ENTITY */]: HTTP_STATUS.UNPROCESSABLE_ENTITY,
  ["INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */]: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  ["TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */]: HTTP_STATUS.TOO_MANY_REQUESTS,
  ["SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */]: HTTP_STATUS.SERVICE_UNAVAILABLE
};
function toHttpStatus(type) {
  return safeLookup(STATUS_MAP, type) ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
}

// src/errors/http-errors/http-error-mapper.ts
var HttpErrorMapper = class {
  static map(error, reply) {
    if (reply.sent) {
      throw error;
    }
    if (error instanceof DomainError) {
      const httpCode = toHttpStatus(error.type);
      return reply.code(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues
      });
    }
    throw error;
  }
};

// src/messages/constants/auth/auth.ts
var AUTH_CONSTANTS = {
  PASSWORD_CHANGED_SUCCESS: "Password changed successfully!"
};

// src/http/controllers/users/reset-password.controller.ts
async function resetPassword(request, reply) {
  const { password, token } = request.body;
  const resetPasswordUseCase = makeResetPasswordUseCase();
  const result = await resetPasswordUseCase.execute({ password, token });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info({ userId: user.publicId }, AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS);
  return reply.code(HTTP_STATUS.OK).send({ message: AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS });
}

// src/use-cases/users/register-user.ts
var import_bcryptjs2 = require("bcryptjs");

// src/use-cases/errors/user-not-created-error.ts
var UserNotCreatedError = class extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_CREATED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/use-cases/users/register-user.ts
var RegisterUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({
    name,
    email,
    cpf: cpf2,
    username,
    password,
    role
  }) {
    const taken = await this.findExistingUser({ email, cpf: cpf2, username });
    if (taken) {
      return taken;
    }
    const passwordHash = await (0, import_bcryptjs2.hash)(password, env.HASH_SALT_ROUNDS);
    const createResult = await this.usersRepository.create({
      name,
      email,
      cpf: cpf2,
      username,
      passwordHash,
      role
    });
    if (isErr(createResult)) {
      return createResult;
    }
    const user = createResult.value;
    if (!user) {
      return err(new UserNotCreatedError());
    }
    return ok({ user });
  }
  /**
   * Email, CPF and username are all unique; any one of them already in use
   * means the same answer. Returns the failure to propagate, or null when the
   * identity is free.
   */
  async findExistingUser(params) {
    const existing = await this.usersRepository.findBy(params);
    if (isErr(existing)) {
      return existing;
    }
    return existing.value ? err(new UserAlreadyExistsError()) : null;
  }
};

// src/use-cases/decorators/transactional-use-case.decorator.ts
var RollbackTransactionError = class extends Error {
  constructor(result) {
    super("Rollback requested by domain logic");
    this.result = result;
  }
  result;
};
var TransactionalUseCaseDecorator = class {
  constructor(useCase, dbContext) {
    this.useCase = useCase;
    this.dbContext = dbContext;
  }
  useCase;
  dbContext;
  async execute(request) {
    try {
      return await this.dbContext.runInTransaction(async () => {
        const result = await this.useCase.execute(request);
        if (isErr(result)) {
          throw new RollbackTransactionError(result);
        }
        return result;
      });
    } catch (error) {
      if (error instanceof RollbackTransactionError) {
        return error.result;
      }
      throw error;
    }
  }
};

// src/use-cases/factories/make-register-user-use-case.ts
function makeRegisterUserUseCase() {
  const dbContext = new DatabaseContext();
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper, dbContext);
  const registerUseCase = new RegisterUserUseCase(usersRepository);
  return new TransactionalUseCaseDecorator(registerUseCase, dbContext);
}

// src/http/presenters/user-presenter.ts
var UserPresenter = class {
  static toHTTP(input) {
    if (Array.isArray(input)) {
      return input.map((u) => this.toHTTP(u));
    }
    return {
      publicId: input.publicId,
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      role: input.role,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }
};

// src/http/controllers/users/register-user.controller.ts
async function register(request, reply) {
  const { name, email, cpf: cpf2, username, password } = request.body;
  const registerUseCase = makeRegisterUserUseCase();
  const result = await registerUseCase.execute({
    name,
    email,
    cpf: cpf2,
    password,
    username,
    role: "DEFAULT" /* DEFAULT */
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info({ userId: user.publicId }, "Usu\xE1rio comum registrado com sucesso!");
  return reply.code(HTTP_STATUS.CREATED).send({ user: UserPresenter.toHTTP(user) });
}
async function registerAdmin(request, reply) {
  const { name, email, cpf: cpf2, username, password } = request.body;
  const registerUseCase = makeRegisterUserUseCase();
  const result = await registerUseCase.execute({
    name,
    email,
    cpf: cpf2,
    username,
    password,
    role: "ADMIN" /* ADMIN */
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info({ userId: user.publicId }, "Usu\xE1rio administrador registrado com sucesso!");
  return reply.code(HTTP_STATUS.CREATED).send({ user: UserPresenter.toHTTP(user) });
}

// src/http/middlewares/verify-jwt.middleware.ts
async function verifyJwt(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
  }
}

// src/http/middlewares/verify-user-role.middleware.ts
function verifyUserRole(allowedRoles) {
  return async (request, reply) => {
    const { role } = request.user;
    if (!role) {
      return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
    }
    if (!allowedRoles.includes(role)) {
      return reply.code(HTTP_STATUS.FORBIDDEN).send({ message: AUTH_ERRORS.FORBIDDEN.message });
    }
  };
}

// src/core/validation/email.ts
var import_zod3 = __toESM(require("zod"));
var emailSchema = import_zod3.default.email().transform((email) => email.toLowerCase());

// src/use-cases/users/authenticate-user.ts
var import_client3 = require("@prisma/client");

// src/use-cases/errors/invalid-credentials-error.ts
var InvalidCredentialsError = class extends DomainError {
  constructor() {
    super(AUTH_ERRORS.INVALID_CREDENTIALS, "UNAUTHORIZED" /* UNAUTHORIZED */);
  }
};

// src/use-cases/users/authenticate-user.ts
var import_bcryptjs3 = require("bcryptjs");
var AuthenticateUserUseCase = class {
  constructor(usersRepository, authenticationAuditUseCase) {
    this.usersRepository = usersRepository;
    this.authenticationAuditUseCase = authenticationAuditUseCase;
  }
  usersRepository;
  authenticationAuditUseCase;
  async execute({
    login,
    password,
    auditContext
  }) {
    const userResult = await this.findByLogin(login);
    if (isErr(userResult)) {
      return userResult;
    }
    const user = userResult.value;
    if (!user) {
      return await this.auditAndReject({ ...auditContext, status: import_client3.AuthenticationStatus.USER_NOT_EXISTS });
    }
    const doesPasswordMatch = await (0, import_bcryptjs3.compare)(password, user.passwordHash);
    if (!doesPasswordMatch) {
      return await this.auditAndReject({
        ...auditContext,
        status: import_client3.AuthenticationStatus.INCORRECT_PASSWORD,
        userId: user.id
      });
    }
    await this.authenticationAuditUseCase.execute({
      ...auditContext,
      status: import_client3.AuthenticationStatus.SUCCESS,
      userId: user.id
    });
    return ok({ user });
  }
  /** The login field is either an email or a username; nothing else differs. */
  async findByLogin(login) {
    return emailSchema.safeParse(login).success ? await this.usersRepository.findBy({ email: login }) : await this.usersRepository.findBy({ username: login });
  }
  /**
   * Every rejection is audited and then reported identically — deliberately, so
   * a wrong password and an unknown user are indistinguishable to the caller.
   */
  async auditAndReject(audit) {
    await this.authenticationAuditUseCase.execute(audit);
    return err(new InvalidCredentialsError());
  }
};

// src/repositories/prisma/prisma-authentication-audit-repository.ts
var PrismaAuthenticationAuditRepository = class {
  async create(data) {
    try {
      const audit = await prisma.authenticationAudit.create({ data: toAuditRow(data) });
      return ok(audit);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
};
function toAuditRow(data) {
  return {
    status: data.status,
    userId: data.userId ?? null,
    ipAddress: data.ipAddress ?? null,
    remotePort: data.remotePort ?? null,
    userAgent: data.userAgent ?? null,
    origin: data.origin ?? null
  };
}

// src/lib/sentry/capture.ts
var import_node2 = require("@sentry/node");
function captureError(error, context = {}) {
  if (!(0, import_node2.isInitialized)()) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  (0, import_node2.withScope)((scope) => {
    const userId = getUserId();
    if (userId) {
      scope.setUser({ id: userId });
    }
    scope.setContext("runtime", { requestId: getRequestId(), ...context });
    (0, import_node2.captureException)(normalized);
  });
}

// src/use-cases/authentication-audit/authentication-audit.ts
var AuthenticationAuditUseCase = class {
  constructor(authenticationAuditRepository) {
    this.authenticationAuditRepository = authenticationAuditRepository;
  }
  authenticationAuditRepository;
  async execute(data) {
    const result = await this.authenticationAuditRepository.create(data);
    if (isErr(result)) {
      logger.error({ error: result.error }, "Falha ao criar registro de auditoria de autentica\xE7\xE3o");
      captureError(result.error, { status: data.status });
      return result;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-authentication-audit-use-case.ts
function makeAuthenticationAuditUseCase() {
  const authenticationAuditRepository = new PrismaAuthenticationAuditRepository();
  return new AuthenticationAuditUseCase(authenticationAuditRepository);
}

// src/use-cases/factories/make-authenticate-user-use-case.ts
function makeAuthenticateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase();
  return new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase);
}

// src/http/controllers/users/authenticate-user.controller.ts
function getAuthenticationAuditContext(request) {
  return {
    ipAddress: request.ip,
    remotePort: request.socket.remotePort?.toString() ?? null,
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
    origin: typeof request.headers.origin === "string" ? request.headers.origin : null
  };
}
async function authenticateUser(request, reply) {
  const { login, password } = request.body;
  const auditContext = getAuthenticationAuditContext(request);
  const authenticateUserUseCase = makeAuthenticateUserUseCase();
  const result = await authenticateUserUseCase.execute({
    login,
    password,
    auditContext
  });
  if (isErr(result)) {
    logger.warn({ login, ip: request.ip }, "Tentativa de login falhou");
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("Usu\xE1rio autenticado com sucesso!");
  const token = await reply.jwtSign({ sub: user.publicId, role: user.role }, { expiresIn: "1d" });
  return reply.code(HTTP_STATUS.OK).send({ token, user: UserPresenter.toHTTP(user) });
}

// src/use-cases/users/delete-user.ts
var DeleteUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({ publicId }) {
    const userResult = await this.usersRepository.findBy({ publicId });
    if (isErr(userResult)) {
      return userResult;
    }
    const userExists = userResult.value;
    if (!userExists) {
      return err(new UserNotFoundError());
    }
    const deleteResult = await this.usersRepository.delete(userExists.publicId);
    if (isErr(deleteResult)) {
      return deleteResult;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-delete-user-use-case.ts
function makeDeleteUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new DeleteUserUseCase(usersRepository);
}

// src/http/controllers/users/delete-user.controller.ts
async function deleteUser(request, reply) {
  const deleteUserUseCase = makeDeleteUserUseCase();
  const result = await deleteUserUseCase.execute({
    publicId: request.user.sub
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  logger.info("Usu\xE1rio deletado com sucesso!");
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}
async function deleteUserByPublicId(request, reply) {
  const { publicId } = request.params;
  const deleteUserUseCase = makeDeleteUserUseCase();
  const result = await deleteUserUseCase.execute({
    publicId
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  logger.info({ targetId: publicId }, "Usu\xE1rio deletado com sucesso!");
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/repositories/prisma/prisma-outbox-event-repository.ts
var import_client4 = require("@prisma/client");
var PrismaOutboxRepository = class {
  constructor(dbContext, httpErrorMapper, infraErrorMapper) {
    this.dbContext = dbContext;
    this.httpErrorMapper = httpErrorMapper;
    this.infraErrorMapper = infraErrorMapper;
  }
  dbContext;
  httpErrorMapper;
  infraErrorMapper;
  async create(data) {
    try {
      const outboxEvent = await this.dbContext.client.outboxEvent.create({
        data: {
          type: data.type,
          status: data.status,
          payload: data.payload,
          expiresAt: data.expiresAt ?? null
        }
      });
      return ok(this.toEntity(outboxEvent));
    } catch (error) {
      return err(this.httpErrorMapper.mapToKnownError(error));
    }
  }
  async findPending(limit) {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: { status: "PENDING" /* PENDING */ },
        orderBy: { occurredAt: "asc" },
        take: limit
      });
      return ok(events.map((e) => this.toEntity(e)));
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async findStuck(stuckBefore, limit) {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: {
          status: "SENDING" /* SENDING */,
          sendingAt: { lte: stuckBefore }
        },
        orderBy: { sendingAt: "asc" },
        take: limit
      });
      return ok(events.map((e) => this.toEntity(e)));
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async findByPublicId(publicId) {
    try {
      const event = await this.dbContext.client.outboxEvent.findUnique({
        where: { publicId }
      });
      return ok(event ? this.toEntity(event) : null);
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async updateStatus(publicId, status) {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: {
          status,
          // SENDING marca o início do ciclo de despacho; demais status limpam o marcador
          ...status === "SENDING" /* SENDING */ ? { sendingAt: /* @__PURE__ */ new Date(), attempts: { increment: 1 } } : { sendingAt: null }
        }
      });
      return ok(void 0);
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async updatePendingRecipients(publicId, pendingRecipients) {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: { pendingRecipients }
      });
      return ok(void 0);
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async delete(publicId) {
    try {
      await this.dbContext.client.outboxEvent.delete({
        where: { publicId }
      });
      return ok(void 0);
    } catch (error) {
      if (error instanceof import_client4.Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return ok(void 0);
      }
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async deleteExpired(now, batchSize) {
    try {
      const batch = await this.dbContext.client.outboxEvent.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: "asc" },
        take: batchSize
      });
      if (batch.length === 0) {
        return ok(0);
      }
      const result = await this.dbContext.client.outboxEvent.deleteMany({
        where: { id: { in: batch.map((e) => e.id) } }
      });
      return ok(result.count);
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async deleteOlderThan(cutoff, batchSize) {
    try {
      const batch = await this.dbContext.client.outboxEvent.findMany({
        where: { occurredAt: { lt: cutoff } },
        select: { id: true, status: true },
        orderBy: { occurredAt: "asc" },
        take: batchSize
      });
      if (batch.length === 0) {
        return ok({ deleted: 0, byStatus: {} });
      }
      const result = await this.dbContext.client.outboxEvent.deleteMany({
        where: { id: { in: batch.map((e) => e.id) } }
      });
      const byStatus = {};
      for (const event of batch) {
        const status = event.status;
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      }
      return ok({ deleted: result.count, byStatus });
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  // ─── Mapper ──────────────────────────────────────────────────────────────────
  toEntity(raw) {
    return {
      id: raw.id,
      publicId: raw.publicId,
      type: raw.type,
      status: raw.status,
      payload: raw.payload,
      attempts: raw.attempts,
      occurredAt: raw.occurredAt,
      sendingAt: raw.sendingAt || void 0,
      expiresAt: raw.expiresAt || void 0,
      pendingRecipients: raw.pendingRecipients
    };
  }
};

// src/messages/errors/outbox.ts
var OUTBOX_ERRORS = {
  EVENT_NOT_FOUND: {
    code: "OUTBOX_EVENT_NOT_FOUND",
    message: "O evento de outbox solicitado n\xE3o foi encontrado no banco de dados."
  },
  OPERATION_FAILED: {
    code: "OUTBOX_OPERATION_FAILED",
    message: "Falha ao processar opera\xE7\xE3o da outbox no banco de dados."
  }
};

// src/use-cases/errors/outbox/outbox-errors.ts
var OutboxEventNotFoundHttpError = class extends DomainError {
  constructor() {
    super(OUTBOX_ERRORS.EVENT_NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};
var OutboxOperationFailedHttpError = class extends SystemError {
  constructor() {
    super(OUTBOX_ERRORS.OPERATION_FAILED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};
var OutboxEventNotFoundInfraError = class extends InfrastructureError {
  constructor(originalError) {
    super(OUTBOX_ERRORS.EVENT_NOT_FOUND, originalError);
  }
};
var OutboxOperationFailedInfraError = class extends InfrastructureError {
  constructor(originalError) {
    super(OUTBOX_ERRORS.OPERATION_FAILED, originalError);
  }
};

// src/repositories/prisma/errors/outbox-error-mapping.ts
var outboxHttpPrismaErrorMapping = {
  P2025: () => new OutboxEventNotFoundHttpError(),
  P2003: () => new OutboxOperationFailedHttpError()
};
var outboxInfraPrismaErrorMapping = {
  P2025: (error) => new OutboxEventNotFoundInfraError(error),
  P2003: (error) => new OutboxOperationFailedInfraError(error)
};

// src/use-cases/outbox-event/outbox-event-use-case.ts
var OutboxEventUseCase = class {
  constructor(outboxRepository) {
    this.outboxRepository = outboxRepository;
  }
  outboxRepository;
  async register(input) {
    return this.outboxRepository.create({
      status: "PENDING" /* PENDING */,
      ...input
    });
  }
};

// src/use-cases/users/forgot-password.ts
var import_node_crypto2 = require("crypto");

// src/core/types/outbox/outbox-event-input.ts
var OUTBOX_EVENT_TYPES = {
  FORM_SUBMISSION_CREATED: "FormSubmissionCreated",
  // The name of an outbox EVENT TYPE, not a credential — the heuristic pairs
  // the word "password" with a string literal on the same line. The real reset
  // token lives only in the transient payload below.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_RESET_REQUESTED: "PasswordResetRequested"
};

// src/messages/constants/auth/password-reset.ts
var PASSWORD_RESET_CONSTANTS = {
  /** Janela de validade do token — também impressa nos templates de e-mail. */
  TOKEN_EXPIRES_IN_MINUTES: 15,
  /** Bytes de entropia do token (64 hex chars). */
  TOKEN_LENGTH_BYTES: 32,
  /**
   * Orçamento de retry do job de e-mail: 3 tentativas × backoff fixo de 30s
   * (~1 min no pior caso) cabe com folga na janela de 15 min do token.
   */
  JOB_ATTEMPTS: 3,
  JOB_BACKOFF_DELAY_MS: 3e4
};

// src/use-cases/users/forgot-password.ts
var import_ms2 = __toESM(require("ms"));
var ForgotPasswordUseCase = class {
  constructor(usersRepository, eventRegistration) {
    this.usersRepository = usersRepository;
    this.eventRegistration = eventRegistration;
  }
  usersRepository;
  eventRegistration;
  async execute({ email }) {
    if (!emailSchema.safeParse(email).success) {
      return ok({ outboxEvent: null });
    }
    const userResult = await this.usersRepository.findBy({ email });
    if (isErr(userResult)) {
      return userResult;
    }
    const user = userResult.value;
    if (!user) {
      return ok({ outboxEvent: null });
    }
    const rawToken = (0, import_node_crypto2.randomBytes)(PASSWORD_RESET_CONSTANTS.TOKEN_LENGTH_BYTES).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + (0, import_ms2.default)(`${PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES}m`));
    const updateResult = await this.usersRepository.updatePassword(user.publicId, {
      token: hashResetToken(rawToken),
      tokenExpiresAt
    });
    if (isErr(updateResult)) {
      return updateResult;
    }
    return await this.registerResetEvent(user, rawToken, tokenExpiresAt);
  }
  /**
   * Same transaction as the token write (TransactionalUseCaseDecorator): either
   * the token and the event both exist, or neither does — no compensation step.
   */
  async registerResetEvent(user, rawToken, tokenExpiresAt) {
    const outboxEvent = await this.eventRegistration.register({
      type: OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      payload: {
        userPublicId: user.publicId,
        name: user.name,
        email: user.email,
        token: rawToken,
        tokenExpiresAt: tokenExpiresAt.toISOString()
      },
      expiresAt: tokenExpiresAt
    });
    if (isErr(outboxEvent)) {
      return outboxEvent;
    }
    return ok({ outboxEvent: outboxEvent.value });
  }
};

// src/use-cases/factories/make-forgot-password-use-case.ts
function makeForgotPasswordUseCase() {
  const dbContext = new DatabaseContext();
  const userErrorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(userErrorMapper, dbContext);
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
  const eventRegistration = new OutboxEventUseCase(outboxRepository);
  const useCase = new ForgotPasswordUseCase(usersRepository, eventRegistration);
  return new TransactionalUseCaseDecorator(useCase, dbContext);
}

// src/messages/constants/redis/redis.ts
var REDIS_CONSTANTS = {
  CHANNELS: {
    OUTBOX_SIGNAL: "outbox-signal"
  },
  KEYS: {
    IDEMPOTENCY_EMAIL_PREFIX: "idempotency:email:",
    RATE_LIMIT_PREFIX: "ratelimit:v1:"
  }
};

// src/messages/constants/logs/outbox.ts
var OUTBOX_LOGS = {
  // outbox-signal
  SIGNAL_PUBLISH_FAILED: "N\xE3o foi poss\xEDvel publicar sinal de envio da nova outbox. O cron job continuar\xE1 funcionando como fallback.",
  SIGNAL_PROCESSING_ERROR: "Erro ao processar sinal de envio do Outbox",
  UNEXPECTED_CHANNEL: "Mensagem recebida em canal inesperado. Ignorando.",
  LISTENER_REMOVED: "Listener anterior de OutboxSignal removido com sucesso",
  SUBSCRIBE_ERROR: "Erro ao se inscrever no canal de OutboxSignal",
  PUBLISHER_CONNECTED: "Redis publisher conectado ao outbox-signal",
  PUBLISHER_ERROR: "Erro no publicador Redis do outbox-signal",
  PUBLISHER_CLOSED: "Conex\xE3o do publicador Redis fechada para outbox-signal",
  SUBSCRIBER_CONNECTED: "Redis subscriber conectado para outbox-signal",
  SUBSCRIBER_ERROR: "Erro no assinante Redis do outbox-signal",
  SUBSCRIBER_CLOSED: "Conex\xE3o do assinante Redis fechada para outbox-signal",
  // outbox-cron
  CRON_START: "Cron de meia-noite: iniciando varredura de seguran\xE7a da Outbox...",
  PHASE1_DONE: "Fase 1 (recupera\xE7\xE3o SENDING): conclu\xEDda.",
  PHASE1_ERROR: "Fase 1 (recupera\xE7\xE3o SENDING): erro inesperado.",
  PHASE2_DONE: "Fase 2 (eventos PENDING): conclu\xEDda.",
  PHASE2_ERROR: "Fase 2 (eventos PENDING): erro inesperado.",
  SCAN_DONE: "Varredura de seguran\xE7a da Outbox conclu\xEDda.",
  SCHEDULER_CONFIGURED: "Agendadores da Outbox configurados: varredura a cada 5 min, seguran\xE7a \xE0 meia-noite e reten\xE7\xE3o \xE0s 03:00.",
  // maintenance-scheduler / maintenance-worker
  MAINTENANCE_PHASE_RETRYING: "Fase de manuten\xE7\xE3o falhou; o BullMQ far\xE1 nova tentativa com backoff antes de desistir.",
  MAINTENANCE_JOB_UNKNOWN: "Job de manuten\xE7\xE3o desconhecido recebido na fila; nada a executar.",
  MAINTENANCE_WORKER_STARTED: "Worker de manuten\xE7\xE3o iniciado e consumindo a fila.",
  MAINTENANCE_QUEUE_ERROR: "Erro na fila de manuten\xE7\xE3o.",
  // outbox-processor
  SKIPPED_ANOTHER_RUNNING: "processPendingEvents: Processamento ignorado. Outra inst\xE2ncia j\xE1 est\xE1 rodando.",
  PENDING_FETCH_ERROR: "Erro de Infra ao buscar eventos pendentes.",
  STUCK_FETCH_ERROR: "Erro de Infra ao buscar eventos travados na Outbox.",
  STATUS_UPDATE_FAILED: "Falha ao atualizar status para SENDING. Evento permanece em PENDING.",
  REVERT_FATAL: "FATAL: Falha ao reverter status para PENDING. Inconsist\xEAncia na DB.",
  DISPATCH_REVERTED: "Falha no dispatch, revertido para PENDING",
  CRITICAL_LOOP_ERROR: "Erro cr\xEDtico inesperado no loop principal de processPendingEvents",
  CRITICAL_RECOVERY_ERROR: "Erro cr\xEDtico inesperado no processStuckSendingEvents",
  MARKED_FAILED: "Evento excedeu o n\xFAmero m\xE1ximo de tentativas de despacho e foi marcado como FAILED.",
  FAILED_MARK_ERROR: "Falha ao marcar evento como FAILED no banco de dados.",
  EXPIRED_EVENT_DELETED: "Evento expirado removido da Outbox sem despacho (link morto nunca \xE9 enviado).",
  EXPIRED_EVENT_DELETE_ERROR: "Falha ao remover evento expirado da Outbox.",
  PENDING_RECIPIENTS_UNRESOLVED: "Destinat\xE1rios pendentes n\xE3o corresponderam a nenhum e-mail reconstru\xEDdo; despachando o lote completo (at-least-once).",
  // outbox-maintenance
  EXPIRY_SWEEP_DELETED: "Varredura de expira\xE7\xE3o: eventos expirados removidos da Outbox.",
  EXPIRY_SWEEP_ERROR: "Erro na varredura de expira\xE7\xE3o da Outbox.",
  RETENTION_PURGED: "Reten\xE7\xE3o: eventos antigos removidos da Outbox.",
  RETENTION_PURGED_NON_TERMINAL: "Reten\xE7\xE3o: eventos PENDING/SENDING antigos removidos da Outbox \u2014 investigar por que n\xE3o foram processados.",
  RETENTION_ERROR: "Erro na reten\xE7\xE3o da Outbox.",
  FIVE_MIN_SWEEP_PENDING_ERROR: "Varredura de 5 min: erro inesperado ao processar eventos PENDING.",
  FIVE_MIN_SWEEP_EXPIRY_ERROR: "Varredura de 5 min: erro inesperado na varredura de expira\xE7\xE3o.",
  RETENTION_CRON_ERROR: "Cron de reten\xE7\xE3o: erro inesperado."
};

// src/lib/metrics/outbox-metrics.ts
var import_prom_client2 = require("prom-client");

// src/lib/metrics/index.ts
var import_prom_client = require("prom-client");
var registry = null;
var initialized = false;
function getRegistry() {
  if (!env.METRICS_ENABLED) return null;
  if (!initialized) {
    registry = new import_prom_client.Registry();
    (0, import_prom_client.collectDefaultMetrics)({ register: registry });
    initialized = true;
  }
  return registry;
}

// src/lib/metrics/outbox-metrics.ts
var registry2 = getRegistry();
var collectMetricsOutboxEventsDispatched = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_dispatched_total",
  help: "Events successfully enqueued to BullMQ",
  registers: [registry2]
}) : null;
var collectMetricsOutboxEventsReverted = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_reverted_total",
  help: "Dispatch failed and the event was successfully reverted to PENDING",
  registers: [registry2]
}) : null;
var collectMetricsOutboxEventsRevertFailed = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_revert_failed_total",
  help: "Dispatch failed and the revert-to-PENDING write also failed (stranded in SENDING)",
  registers: [registry2]
}) : null;
var collectMetricsOutboxEventsMarkedAsTerminalFail = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_marked_as_terminal_fail_total",
  help: "Events marked terminal FAILED after exceeding the dispatch attempts cap (poison message)",
  registers: [registry2]
}) : null;
var collectMetricsOutboxEventsExpired = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_expired_total",
  help: "Events deleted at the expiration gate before dispatch",
  registers: [registry2]
}) : null;
var collectMetricsOutboxEventsStuckSendingEventsRecovered = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_stuck_sending_events_recovered_total",
  help: "Stuck SENDING events reprocessed by the recovery loop",
  registers: [registry2]
}) : null;
var collectMetricsOutboxCronRuns = registry2 ? new import_prom_client2.Counter({
  name: "outbox_cron_runs_total",
  help: "Outbox cron executions by phase",
  labelNames: ["phase"],
  registers: [registry2]
}) : null;
var collectMetricsOutboxCronFailures = registry2 ? new import_prom_client2.Counter({
  name: "outbox_cron_failures_total",
  help: "Maintenance phase failures by phase and outcome (retrying | exhausted)",
  labelNames: ["phase", "outcome"],
  registers: [registry2]
}) : null;
var collectMetricsOutboxMaintenanceDeleted = registry2 ? new import_prom_client2.Counter({
  name: "outbox_maintenance_deleted_total",
  help: "Events deleted by maintenance sweeps, by operation",
  labelNames: ["operation"],
  registers: [registry2]
}) : null;
var collectMetricsOutboxSignalPublished = registry2 ? new import_prom_client2.Counter({
  name: "outbox_signal_published_total",
  help: "Pub/Sub wakeup signals published after an outbox write",
  registers: [registry2]
}) : null;
var collectMetricsOutboxSignalPublishFailed = registry2 ? new import_prom_client2.Counter({
  name: "outbox_signal_publish_failed_total",
  help: "Pub/Sub signal publish failures (Redis unavailable)",
  registers: [registry2]
}) : null;

// src/lib/redis/connections/redis-bullMQ-connection.ts
var import_ioredis = __toESM(require("ioredis"));

// src/messages/constants/logs/redis.ts
var REDIS_LOGS = {
  BULLMQ_UNEXPECTED_ERROR: "Erro inesperado na conex\xE3o Redis do BullMQ",
  CACHE_UNEXPECTED_ERROR: "Erro inesperado na conex\xE3o Redis do cache",
  RATE_LIMITER_UNEXPECTED_ERROR: "Erro inesperado na conex\xE3o Redis do limitador de taxa",
  CONNECTION_DEGRADED: "Conex\xE3o Redis degradada",
  CONNECTION_STILL_DEGRADED: "Conex\xE3o Redis continua degradada",
  CONNECTION_RECOVERED: "Conex\xE3o Redis restabelecida"
};

// src/lib/redis/connections/redis-outage-logger.ts
var CONNECTIVITY_ERROR_CODES = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN"
]);
var CONNECTIVITY_ERROR_PHRASES = [
  "ECONNREFUSED",
  "CONNECTION IS CLOSED",
  "READONLY",
  "ETIMEDOUT",
  "NOAUTH",
  "COMMAND TIMED OUT",
  "STREAM ISN'T WRITEABLE"
];
function isRedisConnectivityError(error) {
  const err2 = error ?? {};
  const message = (err2.message ?? "").toUpperCase();
  const code = (err2.code ?? "").toUpperCase();
  return CONNECTIVITY_ERROR_CODES.has(code) || CONNECTIVITY_ERROR_PHRASES.some((phrase) => message.includes(phrase));
}
var RedisOutageLogger = class {
  constructor(config) {
    this.config = config;
    this.intervalMs = env.REDIS_LOG_OUTAGE_INTERVAL_MS;
  }
  config;
  intervalMs;
  outageStartedAt = null;
  lastWarnAt = 0;
  suppressedEvents = 0;
  onOutage(event, error) {
    const now = Date.now();
    if (this.outageStartedAt === null) {
      this.startOutage(now, event, error);
      return;
    }
    if (now - this.lastWarnAt >= this.intervalMs) {
      this.reportOngoingOutage(now, event, error);
      return;
    }
    this.suppressedEvents += 1;
  }
  /** The connection went from healthy to degraded: always worth one log line. */
  startOutage(now, event, error) {
    this.outageStartedAt = now;
    this.lastWarnAt = now;
    this.suppressedEvents = 0;
    logger.warn({ ...this.identity(), event, err: error }, REDIS_LOGS.CONNECTION_DEGRADED);
  }
  /**
   * Still degraded, and the quiet period has elapsed. Reports how long the
   * outage has run and how many events were swallowed meanwhile, so the rate
   * limiting never hides the scale of the problem.
   */
  reportOngoingOutage(now, event, error) {
    logger.warn(
      {
        ...this.identity(),
        event,
        err: error,
        outageDurationMs: now - (this.outageStartedAt ?? now),
        suppressedEvents: this.suppressedEvents
      },
      REDIS_LOGS.CONNECTION_STILL_DEGRADED
    );
    this.lastWarnAt = now;
    this.suppressedEvents = 0;
  }
  identity() {
    return {
      subsystem: this.config.subsystem,
      redisHost: this.config.host,
      redisPort: this.config.port
    };
  }
  onRecovery() {
    if (this.outageStartedAt === null) {
      return;
    }
    const now = Date.now();
    logger.info(
      {
        subsystem: this.config.subsystem,
        redisHost: this.config.host,
        redisPort: this.config.port,
        outageDurationMs: now - this.outageStartedAt,
        suppressedEvents: this.suppressedEvents
      },
      REDIS_LOGS.CONNECTION_RECOVERED
    );
    this.outageStartedAt = null;
    this.lastWarnAt = 0;
    this.suppressedEvents = 0;
  }
};

// src/lib/redis/connections/attach-outage-logging.ts
function attachOutageLogging(redis, subsystem, unexpectedErrorMessage) {
  const outageLogger = new RedisOutageLogger({
    subsystem,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
  });
  redis.on("ready", () => {
    outageLogger.onRecovery();
  });
  redis.on("connect", () => {
    outageLogger.onRecovery();
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
  redis.on("error", (error) => {
    reportError(outageLogger, subsystem, unexpectedErrorMessage, error);
  });
}
function reportError(outageLogger, subsystem, unexpectedErrorMessage, error) {
  if (isRedisConnectivityError(error)) {
    outageLogger.onOutage("error", error);
    return;
  }
  logger.error(
    {
      subsystem,
      redisHost: env.REDIS_HOST,
      redisPort: env.REDIS_PORT,
      err: error
    },
    unexpectedErrorMessage
  );
}

// src/lib/redis/connections/redis-cache-connection.ts
var import_ioredis2 = __toESM(require("ioredis"));
var MAX_RECONNECT_ATTEMPTS = 2;
var RECONNECT_BACKOFF_STEP_MS = 50;
var RECONNECT_BACKOFF_MAX_MS = 500;
function createRedisCacheConnection() {
  const redis = new import_ioredis2.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || void 0,
    commandTimeout: 1e3,
    connectTimeout: 2e3,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > MAX_RECONNECT_ATTEMPTS) return null;
      return Math.min(times * RECONNECT_BACKOFF_STEP_MS, RECONNECT_BACKOFF_MAX_MS);
    }
  });
  attachOutageLogging(redis, "cache", REDIS_LOGS.CACHE_UNEXPECTED_ERROR);
  return redis;
}

// src/lib/redis/connections/redis-rate-limiter-connection.ts
var import_ioredis3 = __toESM(require("ioredis"));
function createRedisRateLimiterConnection() {
  const redis = new import_ioredis3.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || void 0,
    // === DIFERENÇAS CHAVE PARA O RATE LIMITER ===
    // 1. Timeout agressivo. Rate Limit tem que ser instantâneo.
    // Se demorar mais que 100ms, aborta para não segurar a API.
    commandTimeout: env.NODE_ENV === "test" ? 1e3 : 100,
    // Cache costuma ser 1000ms
    connectTimeout: 2e3,
    // 2. SEM fila offline.
    // Se a conexão cair, falhe o comando imediatamente (throw error).
    // Não queremos acumular verificações de limite na RAM.
    enableOfflineQueue: false,
    // 3. Poucas retentativas.
    // Se falhou, falhou. O 'Fail-Open' na classe RateLimiter vai lidar com isso.
    maxRetriesPerRequest: 0
  });
  attachOutageLogging(redis, "rate-limiter", REDIS_LOGS.RATE_LIMITER_UNEXPECTED_ERROR);
  return redis;
}

// src/lib/redis/connections/redis-outbox-signal-connection.ts
var import_ioredis4 = __toESM(require("ioredis"));
var baseConfig2 = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || void 0,
  lazyConnect: true,
  family: 4
  // force IPv4
};
var RECONNECT_BACKOFF_STEP_MS2 = 100;
var RECONNECT_BACKOFF_MAX_MS2 = 5e3;
function createOutboxPublisherConnection() {
  const redis = new import_ioredis4.default({
    ...baseConfig2,
    enableOfflineQueue: true,
    commandTimeout: 2e3
  });
  attachOutageLogging(redis, "outbox-publisher", OUTBOX_LOGS.PUBLISHER_ERROR);
  return redis;
}
function createOutboxSubscriberConnection() {
  const redis = new import_ioredis4.default({
    ...baseConfig2,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      const delay = Math.min(Math.pow(2, times) * RECONNECT_BACKOFF_STEP_MS2, RECONNECT_BACKOFF_MAX_MS2);
      logger.warn({ times, delay }, "Reconnecting outbox subscriber...");
      return delay;
    }
  });
  attachOutageLogging(redis, "outbox-subscriber", OUTBOX_LOGS.SUBSCRIBER_ERROR);
  return redis;
}

// src/lib/redis/clients/clients.ts
var redisCacheInstance = null;
var redisRateLimitInstance = null;
var redisForQueueInstance = null;
var redisOutboxPublisherInstance = null;
var redisOutboxSubscriberInstance = null;
function getRedisCache() {
  redisCacheInstance ??= createRedisCacheConnection();
  return redisCacheInstance;
}
function getRedisRateLimit() {
  redisRateLimitInstance ??= createRedisRateLimiterConnection();
  return redisRateLimitInstance;
}
function getOutboxPublisher() {
  redisOutboxPublisherInstance ??= createOutboxPublisherConnection();
  return redisOutboxPublisherInstance;
}
function getOutboxSubscriber() {
  redisOutboxSubscriberInstance ??= createOutboxSubscriberConnection();
  return redisOutboxSubscriberInstance;
}
async function closeAllRedisConnections() {
  const targets = [
    redisCacheInstance,
    redisRateLimitInstance,
    redisForQueueInstance,
    redisOutboxPublisherInstance,
    redisOutboxSubscriberInstance
  ].filter((connection) => connection !== null);
  redisCacheInstance = null;
  redisRateLimitInstance = null;
  redisForQueueInstance = null;
  redisOutboxPublisherInstance = null;
  redisOutboxSubscriberInstance = null;
  await Promise.allSettled(
    targets.map((connection) => connection.status === "end" ? Promise.resolve() : connection.quit())
  );
}

// src/lib/infra/events/outbox-signal.ts
function isOutboxSignalPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  return typeof candidate.publicId === "string" && typeof candidate.event === "object" && candidate.event !== null;
}
function getPublisher() {
  const publisher = getOutboxPublisher();
  publisher.on("connect", () => {
    logger.info(OUTBOX_LOGS.PUBLISHER_CONNECTED);
  });
  publisher.on("error", (err2) => {
    logger.error({ err: err2 }, OUTBOX_LOGS.PUBLISHER_ERROR);
  });
  publisher.on("close", () => {
    logger.warn(OUTBOX_LOGS.PUBLISHER_CLOSED);
  });
  return publisher;
}
function getSubscriber() {
  const subscriber = getOutboxSubscriber();
  subscriber.on("connect", () => {
    logger.info(OUTBOX_LOGS.SUBSCRIBER_CONNECTED);
  });
  subscriber.on("error", (err2) => {
    logger.error({ err: err2 }, OUTBOX_LOGS.SUBSCRIBER_ERROR);
  });
  subscriber.on("close", () => {
    logger.warn(OUTBOX_LOGS.SUBSCRIBER_CLOSED);
  });
  return subscriber;
}
async function ensureConnected(client, name) {
  if (client.status === "wait" || client.status === "close" || client.status === "end") {
    logger.info(`Conectando ${name}...`);
    await client.connect();
  }
}
var activeMessageListener = null;
function createMessageHandler(onSignal) {
  return async (channel, message) => {
    if (channel !== REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL) {
      logger.warn({ channel }, OUTBOX_LOGS.UNEXPECTED_CHANNEL);
      return;
    }
    try {
      const parsed = JSON.parse(message);
      if (!isOutboxSignalPayload(parsed)) {
        logger.warn({ message }, OUTBOX_LOGS.UNEXPECTED_CHANNEL);
        return;
      }
      await onSignal(parsed.publicId, parsed.event);
    } catch (err2) {
      logger.error({ err: err2, publicId: message }, OUTBOX_LOGS.SIGNAL_PROCESSING_ERROR);
      captureError(err2, { publicId: message });
    }
  };
}
var OutboxSignal = {
  /**
   * Publishes a wakeup signal after a successful outbox write.
   * Fire-and-forget by design: if Redis is unavailable the cron job is the
   * durable fallback, so we swallow the error here intentionally.
   *
   * Call this from your Controller/Service *after* the DB transaction commits.
   */
  async publishNewItem(publicId, event) {
    try {
      const client = getPublisher();
      await ensureConnected(client, "OutboxPublisher");
      await client.publish(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId, event }));
      collectMetricsOutboxSignalPublished?.inc();
    } catch (err2) {
      collectMetricsOutboxSignalPublishFailed?.inc();
      logger.warn({ err: err2 }, OUTBOX_LOGS.SIGNAL_PUBLISH_FAILED);
    }
  },
  /**
   * Subscribes the Worker to the outbox channel.
   *
   * Seguro para ser chamado múltiplas vezes: o listener anterior é removido
   * com precisão via `off` antes de registrar o novo, evitando:
   *   1. Listeners duplicados (processamento duplo por mensagem)
   *   2. Memory leak de closures antigas de `onSignal`
   *   3. Destruição acidental dos listeners de lifecycle do subscriber
   *
   * @param onSignal - async callback invoked when a new item is signalled.
   *                   Errors thrown here are caught and logged — they won't
   *                   crash the worker process.
   */
  async subscribe(onSignal) {
    try {
      const client = getSubscriber();
      await ensureConnected(client, "OutboxSubscriber");
      if (activeMessageListener !== null) {
        client.off("message", activeMessageListener);
        logger.info(OUTBOX_LOGS.LISTENER_REMOVED);
      }
      const handleMessage = createMessageHandler(onSignal);
      activeMessageListener = (channel, message) => {
        void handleMessage(channel, message);
      };
      client.on("message", activeMessageListener);
      await client.subscribe(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL);
    } catch (err2) {
      logger.error({ err: err2 }, OUTBOX_LOGS.SUBSCRIBE_ERROR);
      captureError(err2);
    }
  },
  disconnect() {
    if (activeMessageListener !== null) {
      getOutboxSubscriber().off("message", activeMessageListener);
      activeMessageListener = null;
    }
  }
};

// src/messages/constants/email/email.ts
var EMAIL_CONSTANTS = {
  PASSWORD_RECOVERY_SUBJECT: "Recupera\xE7\xE3o de senha",
  PASSWORD_RESET_GENERIC_MESSAGE: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
};

// src/http/controllers/users/forgot-password.controller.ts
async function forgotPassword(request, reply) {
  const { email } = request.body;
  if (!email) {
    return reply.code(HTTP_STATUS.OK).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE });
  }
  const forgotPasswordUseCase = makeForgotPasswordUseCase();
  const result = await forgotPasswordUseCase.execute({ email });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { outboxEvent } = result.value;
  if (outboxEvent) {
    void OutboxSignal.publishNewItem(outboxEvent.publicId, outboxEvent);
  }
  return reply.code(HTTP_STATUS.OK).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE });
}

// src/use-cases/users/get-user-profile.ts
var GetUserProfileUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({ publicId }) {
    const userResult = await this.usersRepository.findBy({ publicId });
    if (isErr(userResult)) {
      return userResult;
    }
    const user = userResult.value;
    if (!user) {
      return err(new UserNotFoundError());
    }
    return ok({ user });
  }
};

// src/use-cases/factories/make-get-user-profile-use-case.ts
function makeGetUserProfileUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new GetUserProfileUseCase(usersRepository);
}

// src/http/schemas/utils/public-id-schema.ts
var import_zod4 = require("zod");
var publicIdSchema = import_zod4.z.object({
  publicId: import_zod4.z.uuid()
});

// src/http/controllers/users/get-user-profile.controller.ts
async function getUserProfile(request, reply) {
  const getUserProfileUseCase = makeGetUserProfileUseCase();
  const data = { publicId: request.user.sub };
  const { publicId } = publicIdSchema.parse(data);
  const result = await getUserProfileUseCase.execute({ publicId });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("Perfil do usu\xE1rio obtido com sucesso!");
  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user));
}
async function getUserByPublicId(request, reply) {
  const { publicId } = request.params;
  const getUserProfileUseCase = makeGetUserProfileUseCase();
  const result = await getUserProfileUseCase.execute({ publicId });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("Usu\xE1rio obtido com sucesso!");
  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user));
}

// src/use-cases/users/update-user.ts
var UpdateUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({
    publicId,
    name,
    email,
    username
  }) {
    const userResult = await this.usersRepository.findBy({ publicId });
    if (isErr(userResult)) {
      return userResult;
    }
    const userToBeUpdated = userResult.value;
    if (!userToBeUpdated) {
      return err(new UserNotFoundError());
    }
    const conflict = await this.findUniquenessConflict({ email, username }, userToBeUpdated.publicId);
    if (conflict) {
      return conflict;
    }
    const updateResult = await this.usersRepository.update(
      userToBeUpdated.publicId,
      buildUpdate({ name, email, username })
    );
    if (isErr(updateResult)) {
      return updateResult;
    }
    return ok({ user: updateResult.value });
  }
  /**
   * Email and username are both unique, and were checked with two copies of the
   * same six lines. Checked in that order, as before: whichever conflicts first
   * is the one reported.
   */
  async findUniquenessConflict(fields, currentPublicId) {
    const entries = Object.entries(fields);
    const provided = entries.filter(([, value]) => value != null);
    for (const [field, value] of provided) {
      const result = await this.usersRepository.findBy({ [field]: value });
      if (isErr(result)) {
        return result;
      }
      const owner = result.value;
      if (owner && owner.publicId !== currentPublicId) {
        return err(new UserAlreadyExistsError());
      }
    }
    return null;
  }
};
function buildUpdate({ name, email, username }) {
  const data = {};
  if (name !== void 0) data.name = name;
  if (email !== void 0) data.email = email;
  if (username !== void 0) data.username = username;
  data.updatedAt = /* @__PURE__ */ new Date();
  return data;
}

// src/use-cases/factories/make-update-user-use-case.ts
function makeUpdateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new UpdateUserUseCase(usersRepository);
}

// src/http/controllers/users/update-user.controller.ts
async function updateUser(request, reply) {
  const { name, username, email } = request.body;
  const authUser = request.user;
  const publicId = authUser.publicId ?? authUser.sub;
  if (!publicId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
  }
  const { publicId: validatedPublicId } = publicIdSchema.parse({ publicId });
  const updateUserUseCase = makeUpdateUserUseCase();
  const result = await updateUserUseCase.execute({
    publicId: validatedPublicId,
    name,
    email,
    username
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("Usu\xE1rio atualizado com sucesso!");
  return reply.code(HTTP_STATUS.OK).send(UserPresenter.toHTTP(user));
}

// src/http/controllers/users/users.routes.ts
var import_client5 = require("@prisma/client");

// src/use-cases/users/list-users.ts
var ListUsersUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute() {
    const listResult = await this.usersRepository.list();
    if (isErr(listResult)) {
      return listResult;
    }
    const users = listResult.value;
    return ok({ users });
  }
};

// src/use-cases/factories/make-list-users-use-case.ts
function makeListUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new ListUsersUseCase(usersRepository);
}

// src/http/controllers/users/list-users.controller.ts
async function listUsers(_request, reply) {
  const listUsersUseCase = makeListUsersUseCase();
  const result = await listUsersUseCase.execute();
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { users } = result.value;
  logger.info("Usu\xE1rios obtidos com sucesso!");
  return reply.code(HTTP_STATUS.OK).send({ users: UserPresenter.toHTTP(users) });
}

// src/use-cases/users/search-users-use-case.ts
var SearchUsersUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  usersRepository;
  async execute({ query, page }) {
    const searchResult = await this.usersRepository.search(query, page);
    if (isErr(searchResult)) {
      return searchResult;
    }
    const users = searchResult.value;
    return ok({ users });
  }
};

// src/use-cases/factories/make-search-users-use-case.ts
function makeSearchUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  return new SearchUsersUseCase(usersRepository);
}

// src/http/controllers/users/search-users.controller.ts
async function searchUsersController(request, reply) {
  const { query, page } = request.query;
  const searchUsersUseCase = makeSearchUsersUseCase();
  const result = await searchUsersUseCase.execute({
    query,
    page
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { users } = result.value;
  logger.info(`Encontrados ${users.length} usu\xE1rios para a consulta: "${query}" na p\xE1gina ${page}.`);
  return reply.code(HTTP_STATUS.OK).send({ users });
}

// src/http/policies/rate-limit.ts
var HTTP_RATE_LIMIT_POLICIES = {
  global: {
    max: env.HTTP_RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW
  },
  auth: {
    session: {
      max: env.HTTP_RATE_LIMIT_AUTH_SESSION_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW
    },
    register: {
      max: env.HTTP_RATE_LIMIT_AUTH_REGISTER_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW
    },
    forgotPassword: {
      max: env.HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW
    },
    resetPassword: {
      max: env.HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW
    }
  },
  users: {
    list: {
      max: env.HTTP_RATE_LIMIT_USERS_LIST_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW
    },
    delete: {
      max: env.HTTP_RATE_LIMIT_USERS_DELETE_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW
    }
  },
  churches: {
    nearest: {
      max: env.HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW
    }
  },
  forms: {
    submit: {
      max: env.HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW
    }
  },
  analytics: {
    session: {
      max: env.HTTP_RATE_LIMIT_ANALYTICS_SESSION_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_ANALYTICS_SESSION_TIME_WINDOW
    },
    events: {
      max: env.HTTP_RATE_LIMIT_ANALYTICS_EVENTS_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_ANALYTICS_EVENTS_TIME_WINDOW
    },
    identify: {
      max: env.HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_TIME_WINDOW
    },
    read: {
      max: env.HTTP_RATE_LIMIT_ANALYTICS_READ_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_ANALYTICS_READ_TIME_WINDOW
    }
  },
  health: {
    check: {
      max: env.HTTP_RATE_LIMIT_HEALTH_CHECK_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW,
      skipOnError: true
    }
  }
};

// src/http/schemas/users/authenticate-schema.ts
var import_zod6 = require("zod");

// src/http/schemas/utils/username.ts
var import_zod5 = __toESM(require("zod"));

// src/http/schemas/validation-limits.ts
var VALIDATION_LIMITS = {
  /** Matches the `varchar(255)` columns the values are stored in. */
  NAME_MIN: 4,
  NAME_MAX: 255,
  CHURCH_NAME_MIN: 3,
  CHURCH_ADDRESS_MIN: 5,
  USERNAME_MIN: 3,
  USERNAME_MAX: 60,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 64,
  /** A CPF is always eleven digits once punctuation is stripped. */
  CPF_DIGITS: 11,
  /**
   * Analytics ingestion ceilings (§4.2).
   *
   * The previous schema had none — `eventType` and `path` were `z.string()` and
   * `payload` was `z.record(z.any())`. With Fastify's default 1 MiB body limit
   * and 300 req/min/IP that is roughly 300 MB/min/IP of arbitrary JSON going
   * straight into Postgres, without forging anything.
   */
  ANALYTICS_PATH_MAX: 2048,
  ANALYTICS_TITLE_MAX: 512,
  ANALYTICS_REFERRER_MAX: 2048,
  ANALYTICS_LANGUAGE_MAX: 35,
  ANALYTICS_PAYLOAD_VALUE_MAX: 512,
  ANALYTICS_PAYLOAD_KEYS_MAX: 20,
  ANALYTICS_EVENTS_PER_BATCH_MAX: 50,
  /** A day in milliseconds: anything longer is a clock problem, not a reading. */
  ANALYTICS_DURATION_MS_MAX: 864e5,
  ANALYTICS_SCROLL_DEPTH_MAX: 100,
  /** A UUIDv7 with room to spare; the value is opaque and always ours. */
  ANALYTICS_VISITOR_ID_MAX: 64,
  ANALYTICS_READ_PAGE_DEFAULT: 50,
  ANALYTICS_READ_PAGE_MAX: 200,
  /** Visits shown alongside a visitor profile, newest first. */
  ANALYTICS_READ_VISITS_LIMIT: 100
};

// src/http/schemas/utils/username.ts
var usernameSchema = import_zod5.default.string().trim().min(VALIDATION_LIMITS.USERNAME_MIN).max(VALIDATION_LIMITS.USERNAME_MAX);

// src/http/schemas/users/authenticate-schema.ts
var authenticateSchema = import_zod6.z.object({
  login: import_zod6.z.union([usernameSchema, emailSchema]),
  password: import_zod6.z.string().trim().min(4)
});

// src/http/schemas/users/forgot-password-schema.ts
var import_zod7 = require("zod");
var forgotPasswordSchema = import_zod7.z.object({
  email: emailSchema
});

// src/http/schemas/users/register-schema.ts
var import_zod10 = require("zod");

// src/http/schemas/utils/cpf.ts
var import_zod8 = require("zod");
var import_cpf_cnpj_validator = require("cpf-cnpj-validator");

// src/messages/constants/validation/validation.ts
var VALIDATION_CONSTANTS = {
  CPF: {
    INVALID: "CPF inv\xE1lido!"
  },
  PASSWORD: {
    TOO_SHORT: "A senha deve ter pelo menos 8 caracteres.",
    TOO_LONG: "A senha deve ter no m\xE1ximo 64 caracteres.",
    UPPERCASE: "A senha deve conter pelo menos uma letra mai\xFAscula.",
    LOWERCASE: "A senha deve conter pelo menos uma letra min\xFAscula.",
    DIGIT: "A senha deve conter pelo menos um n\xFAmero.",
    SPECIAL: "A senha deve conter pelo menos um caractere especial.",
    NO_SPACES: "A senha n\xE3o pode conter espa\xE7os."
  },
  CEP: {
    INVALID_FORMAT: "CEP inv\xE1lido. Use o formato 12345-678 ou 12345678."
  }
};

// src/http/schemas/utils/cpf.ts
var cpfSchema = import_zod8.z.preprocess(
  (val) => typeof val === "string" ? val.replace(/\D/g, "") : val,
  import_zod8.z.string().length(VALIDATION_LIMITS.CPF_DIGITS, { message: VALIDATION_CONSTANTS.CPF.INVALID }).refine(import_cpf_cnpj_validator.cpf.isValid, { message: VALIDATION_CONSTANTS.CPF.INVALID }).transform(import_cpf_cnpj_validator.cpf.format)
);

// src/http/schemas/utils/password.ts
var import_zod9 = require("zod");
var passwordSchema = import_zod9.z.string().trim().min(VALIDATION_LIMITS.PASSWORD_MIN, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_SHORT }).max(VALIDATION_LIMITS.PASSWORD_MAX, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_LONG }).regex(/[A-Z]/, { message: VALIDATION_CONSTANTS.PASSWORD.UPPERCASE }).regex(/[a-z]/, { message: VALIDATION_CONSTANTS.PASSWORD.LOWERCASE }).regex(/\d/, { message: VALIDATION_CONSTANTS.PASSWORD.DIGIT }).regex(/[\W_]/, { message: VALIDATION_CONSTANTS.PASSWORD.SPECIAL }).refine((val) => !val.includes(" "), { message: VALIDATION_CONSTANTS.PASSWORD.NO_SPACES });

// src/http/schemas/users/register-schema.ts
var registerSchema = import_zod10.z.object({
  name: import_zod10.z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  username: usernameSchema,
  email: emailSchema,
  cpf: cpfSchema,
  password: passwordSchema
});

// src/http/schemas/users/reset-password-schema.ts
var import_zod11 = require("zod");
var resetPasswordSchema = import_zod11.z.object({
  password: passwordSchema,
  token: import_zod11.z.string()
});

// src/http/schemas/users/search-users-schema.ts
var import_zod12 = require("zod");
var searchUsersSchema = import_zod12.z.object({
  query: import_zod12.z.string().optional().default(""),
  page: import_zod12.z.coerce.number().int().positive().default(1)
});

// src/http/schemas/users/update-schema.ts
var import_zod13 = require("zod");
var updateSchema = import_zod13.z.object({
  name: import_zod13.z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional()
});

// src/http/controllers/users/users.routes.ts
async function usersRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  registerAuthRoutes(app2);
  registerProfileRoutes(app2);
  registerAdminRoutes(app2);
}
function registerAuthRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  app2.post(
    "/register/admin",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register },
      schema: { tags: ["Users"], summary: "Register admin", body: registerSchema }
    },
    registerAdmin
  );
  app2.post(
    "/register",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register },
      schema: { tags: ["Users"], summary: "Register user", body: registerSchema }
    },
    register
  );
  app2.post(
    "/sessions",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session },
      schema: { tags: ["Users"], summary: "Authenticate user", body: authenticateSchema }
    },
    authenticateUser
  );
  app2.post(
    "/forgot-password",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword },
      schema: { tags: ["Users"], summary: "Forgot password", body: forgotPasswordSchema }
    },
    forgotPassword
  );
  app2.patch(
    "/reset-password",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword },
      schema: { tags: ["Users"], summary: "Reset password", body: resetPasswordSchema }
    },
    resetPassword
  );
}
function registerProfileRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  app2.patch(
    "/me",
    {
      onRequest: [verifyJwt],
      schema: { tags: ["Users"], summary: "Update profile", body: updateSchema }
    },
    updateUser
  );
  app2.get(
    "/me",
    {
      onRequest: [verifyJwt],
      schema: { tags: ["Users"], summary: "Get profile" }
    },
    getUserProfile
  );
  app2.delete(
    "/me",
    {
      onRequest: [verifyJwt],
      schema: { tags: ["Users"], summary: "Delete profile" }
    },
    deleteUser
  );
}
function registerAdminRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  const adminOnly = [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])];
  const byPublicId = "/:publicId";
  app2.get(
    "/",
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list },
      schema: { tags: ["Users"], summary: "List users" }
    },
    listUsers
  );
  app2.get(
    "/search",
    {
      onRequest: adminOnly,
      schema: { tags: ["Users"], summary: "Search users", querystring: searchUsersSchema }
    },
    searchUsersController
  );
  app2.patch(
    byPublicId,
    {
      onRequest: adminOnly,
      schema: { tags: ["Users"], summary: "Update user", params: publicIdSchema, body: updateSchema }
    },
    updateUser
  );
  app2.delete(
    byPublicId,
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete },
      schema: { tags: ["Users"], summary: "Delete user", params: publicIdSchema }
    },
    deleteUserByPublicId
  );
  app2.get(
    byPublicId,
    {
      onRequest: adminOnly,
      schema: { tags: ["Users"], summary: "Get user by public ID", params: publicIdSchema }
    },
    getUserByPublicId
  );
}

// src/messages/errors/forms.ts
var FORM_ERRORS = {
  SUBMISSION: {
    code: "FORM_SUBMISSION_ERROR",
    message: "Ocorreu um erro ao submeter o formul\xE1rio."
  },
  ALREADY_EXISTS: {
    code: "FORM_ALREADY_EXISTS",
    message: "J\xE1 existe um formul\xE1rio submetido com este email."
  },
  NOT_FOUND: {
    code: "FORM_NOT_FOUND",
    message: "Nenhum formul\xE1rio encontrado para o email fornecido."
  }
};

// src/use-cases/errors/forms/forms-not-found-error.ts
var FormsNotFoundError = class extends DomainError {
  constructor() {
    super(FORM_ERRORS.NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/repositories/prisma/prisma-forms-repository.ts
var PrismaFormsRepository = class {
  constructor(dbContext, errorMapper) {
    this.dbContext = dbContext;
    this.errorMapper = errorMapper;
  }
  dbContext;
  errorMapper;
  async create(data) {
    try {
      const formSubmission2 = await this.dbContext.client.formSubmission.create({
        data
      });
      return ok(formSubmission2);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async findByEmail(email) {
    try {
      const formSubmission2 = await this.dbContext.client.formSubmission.findFirst({
        where: {
          email
        }
      });
      if (!formSubmission2) {
        return err(new FormsNotFoundError());
      }
      return ok(formSubmission2);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
};

// src/use-cases/errors/forms/forms-already-exists-error.ts
var FormsAlreadyExistsError = class extends DomainError {
  constructor() {
    super(FORM_ERRORS.ALREADY_EXISTS, "CONFLICT" /* CONFLICT */);
  }
};

// src/use-cases/forms/forms-submission.ts
var FormsSubmissionUseCase = class {
  constructor(formsSubmissionRepository, eventRegistration) {
    this.formsSubmissionRepository = formsSubmissionRepository;
    this.eventRegistration = eventRegistration;
  }
  formsSubmissionRepository;
  eventRegistration;
  async execute(request) {
    const findEmailResult = await this.formsSubmissionRepository.findByEmail(request.email);
    if (isOk(findEmailResult)) {
      return err(new FormsAlreadyExistsError());
    }
    if (findEmailResult.error.body.code !== "FORM_NOT_FOUND") {
      return findEmailResult;
    }
    const formSubmissionResult = await this.formsSubmissionRepository.create({
      name: request.name,
      lastName: request.lastName,
      email: request.email,
      decisaoPorCristo: request.decisaoPorCristo,
      location: request.location || void 0,
      ipAddress: request.ipAddress || void 0
    });
    if (isErr(formSubmissionResult)) {
      return formSubmissionResult;
    }
    const sanitizedFormSubmission = sanitize(formSubmissionResult.value);
    return await this.registerNotification(sanitizedFormSubmission);
  }
  /**
   * 3. Side-effect seguro (Outbox Pattern)
   *
   * Grava o evento em 'outbox_events' NA MESMA TRANSAÇÃO do formulário. O
   * ipAddress fica fora do payload persistido: é dado sensível e desnecessário
   * para o e-mail.
   */
  async registerNotification(sanitizedFormSubmission) {
    const outboxEvent = await this.eventRegistration.register({
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: {
        name: sanitizedFormSubmission.name,
        lastName: sanitizedFormSubmission.lastName,
        email: sanitizedFormSubmission.email,
        decisaoPorCristo: sanitizedFormSubmission.decisaoPorCristo,
        location: sanitizedFormSubmission.location
      }
    });
    if (isErr(outboxEvent)) {
      return outboxEvent;
    }
    return ok({
      sanitizedFormSubmission,
      outboxEvent: outboxEvent.value
    });
  }
};
function sanitize(formSubmission2) {
  return {
    name: formSubmission2.name,
    lastName: formSubmission2.lastName,
    email: formSubmission2.email,
    decisaoPorCristo: formSubmission2.decisaoPorCristo,
    location: formSubmission2.location ?? null,
    ipAddress: formSubmission2.ipAddress ?? null
  };
}

// src/use-cases/errors/forms/forms-submission-error.ts
var FormsSubmissionError = class extends DomainError {
  constructor() {
    super(FORM_ERRORS.SUBMISSION, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/repositories/prisma/errors/forms-error-mapping.ts
var formsPrismaErrorMapping = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError()
};

// src/use-cases/forms/factories/make-form-submission-use-case.ts
function makeFormSubmissionUseCase() {
  const dbContext = new DatabaseContext();
  const formsErrorMapper = new PrismaErrorMapper(formsPrismaErrorMapping);
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
  const formsRepository = new PrismaFormsRepository(dbContext, formsErrorMapper);
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
  const notificationPublisher = new OutboxEventUseCase(outboxRepository);
  const useCase = new FormsSubmissionUseCase(formsRepository, notificationPublisher);
  return new TransactionalUseCaseDecorator(useCase, dbContext);
}

// src/http/controllers/forms/form.controller.ts
async function formSubmission(request, reply) {
  const data = request.body;
  const formSubmissionUseCase = makeFormSubmissionUseCase();
  const result = await formSubmissionUseCase.execute({
    ...data,
    ipAddress: request.ip
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { sanitizedFormSubmission, outboxEvent } = result.value;
  void OutboxSignal.publishNewItem(outboxEvent.publicId, outboxEvent);
  logger.info({ sanitizedFormSubmission }, "Formul\xE1rio recebido com sucesso");
  return reply.code(HTTP_STATUS.CREATED).send({
    sanitizedFormSubmission
  });
}

// src/http/schemas/forms/forms-schema.ts
var import_zod14 = require("zod");
var formsSchema = import_zod14.z.object({
  name: import_zod14.z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  lastName: import_zod14.z.string().trim().min(VALIDATION_LIMITS.NAME_MIN).max(VALIDATION_LIMITS.NAME_MAX),
  email: emailSchema,
  decisaoPorCristo: import_zod14.z.boolean(),
  location: import_zod14.z.string().optional()
});

// src/http/controllers/forms/forms.routes.ts
async function formsRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  app2.post(
    "/submit-form",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.forms.submit },
      schema: {
        tags: ["Forms"],
        summary: "Envia um formul\xE1rio de evangelismo",
        body: formsSchema
      }
    },
    formSubmission
  );
}

// src/messages/errors/churches.ts
var CHURCH_ERRORS = {
  NOT_FOUND: {
    code: "CHURCH_NOT_FOUND",
    message: "Igreja n\xE3o encontrada."
  },
  ALREADY_EXISTS: {
    code: "CHURCH_ALREADY_EXISTS",
    message: "J\xE1 existe uma igreja cadastrada com este nome e/ou coordenadas"
  },
  INVALID_CEP: {
    code: "INVALID_CEP",
    message: "O CEP fornecido n\xE3o existe."
  },
  COORDINATES_NOT_FOUND: {
    code: "COORDINATES_NOT_FOUND",
    message: "Coordenadas n\xE3o encontradas para o endere\xE7o fornecido."
  },
  NO_ADDRESS_PROVIDED: {
    code: "NO_ADDRESS_PROVIDED",
    message: "Nenhum endere\xE7o fornecido para convers\xE3o de CEP."
  },
  LATITUDE_OUT_OF_RANGE: {
    code: "LATITUDE_OUT_OF_RANGE",
    message: "A Latitude deve estar entre -90 e 90 graus."
  },
  LONGITUDE_OUT_OF_RANGE: {
    code: "LONGITUDE_OUT_OF_RANGE",
    message: "A longitude deve estar entre -180 e 180 graus."
  },
  CREATE_FAILED: {
    code: "CREATE_CHURCH_FAILED",
    message: "Falha ao criar a igreja."
  },
  EMPTY_LIST: {
    code: "EMPTY_CHURCH_LIST",
    message: "Lista de igrejas vazia!"
  },
  NO_NEARBY_FOUND: {
    code: "NO_NEARBY_CHURCHES_FOUND",
    message: "Nenhuma igreja encontrada nas proximidades."
  },
  CEP_TO_LAT_LON_FAILED: {
    code: "CEP_TO_LAT_LON_FAILED",
    message: "Falha ao processar o CEP"
  }
};
var INVALID_CEP_ERROR_FN = (cep) => ({
  code: "INVALID_CEP",
  message: cep ? `O CEP fornecido ${cep} n\xE3o existe.` : "O CEP fornecido n\xE3o existe."
});

// src/use-cases/errors/coordinates-not-found-error.ts
var CoordinatesNotFoundError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.COORDINATES_NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */, "not_found" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/invalid-cep-error.ts
var InvalidCepError = class extends DomainError {
  constructor(cep) {
    super(INVALID_CEP_ERROR_FN(cep), "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */, "not_found" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/cep-to-lat-lon-error.ts
var CepToLatLonError = class extends SystemError {
  constructor(cep) {
    super(
      {
        code: CHURCH_ERRORS.CEP_TO_LAT_LON_FAILED.code,
        message: `${CHURCH_ERRORS.CEP_TO_LAT_LON_FAILED.message} ${cep}.`
      },
      "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */
    );
  }
};

// src/messages/constants/churches/churches.ts
var ROUTING_MAX_DISTANCE_KM = {
  ["pedestrian" /* PEDESTRIAN */]: 10,
  ["bikeshare" /* BIKESHARE */]: 30,
  ["bicycle" /* BICYCLE */]: 50,
  ["low_speed_vehicle" /* LOW_SPEED_VEHICLE */]: 50,
  ["motor_scooter" /* MOTOR_SCOOTER */]: 100,
  ["auto" /* AUTO */]: 150,
  ["taxi" /* TAXI */]: 150,
  ["motorcycle" /* MOTORCYCLE */]: 150,
  ["bus" /* BUS */]: 150,
  ["truck" /* TRUCK */]: 150
};
var CHURCH_CONSTANTS = {
  KNN_LIMIT: 5,
  /**
   * Ceiling for the PostGIS nearest-neighbour query.
   *
   * The index-backed search runs in tens of milliseconds; a second is generous
   * enough that only a genuinely unhealthy database hits it, and short enough
   * that it cannot eat a meaningful share of the request budget. Narrowed
   * further whenever less than a second of budget remains.
   */
  KNN_BUDGET_MS: 1e3,
  GEOCODING_COUNTRY: "Brazil",
  UNKNOWN_PROVIDER: "Unknown"
};

// src/use-cases/churches/cep-to-lat-lon-use-case.ts
var CepToLatLonUseCase = class {
  constructor(geocodingProvider, addressProvider) {
    this.geocodingProvider = geocodingProvider;
    this.addressProvider = addressProvider;
  }
  geocodingProvider;
  addressProvider;
  async execute({ cep, deadline }) {
    return await this.processCep(cep.replace(/\D/g, ""), deadline);
  }
  async processCep(cleanCep, deadline) {
    const addrResult = await this.addressProvider.fetchAddress(cleanCep, deadline);
    if (isErr(addrResult)) {
      return err(addrResult.error);
    }
    const address = addrResult.value;
    if (!address) {
      return err(new InvalidCepError());
    }
    const directCoordinates = this.mapAddressCoordinates(address);
    if (directCoordinates) {
      return ok(directCoordinates);
    }
    return await this.geocodeAddress(cleanCep, address, deadline);
  }
  /**
   * Some address providers (AwesomeAPI) already return coordinates, letting us
   * skip geocoding entirely. Returns null when they did not.
   */
  mapAddressCoordinates(address) {
    if (!address.lat || !address.lon) {
      return null;
    }
    return {
      userLat: address.lat,
      userLon: address.lon,
      precision: address.precision ?? "NO_CERTAINTY" /* NO_CERTAINTY */,
      coordinatesProviderName: address.providerName ?? CHURCH_CONSTANTS.UNKNOWN_PROVIDER
    };
  }
  async geocodeAddress(cleanCep, address, deadline) {
    const strategies = [
      () => this.searchByStreet(address, deadline),
      () => this.searchByNeighborhood(address, deadline),
      () => this.searchByCity(address, deadline)
    ];
    for (const runStrategy of strategies) {
      const outcome = await runStrategy();
      if (outcome) {
        return outcome;
      }
    }
    logger.error({ cep: cleanCep, city: address.localidade }, "Cr\xEDtico: Geocoding Provider n\xE3o encontrou a cidade.");
    return err(new CepToLatLonError(cleanCep));
  }
  /** Strategy A: Exact Match (Street) */
  async searchByStreet(address, deadline) {
    const { logradouro, localidade, uf } = address;
    if (!logradouro) {
      return null;
    }
    const result = await this.geocodingProvider.search(
      `${logradouro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
      deadline
    );
    return this.interpretSearch(result);
  }
  /** Strategy B: Approximate Match (Neighborhood) */
  async searchByNeighborhood(address, deadline) {
    const { bairro, localidade, uf } = address;
    if (!bairro) {
      return null;
    }
    const result = await this.geocodingProvider.search(
      `${bairro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
      deadline
    );
    return this.interpretSearch(result);
  }
  /**
   * Strategy C: City Fallback. Unlike A and B this is the last resort, so an
   * empty result is a definitive CoordinatesNotFoundError rather than a
   * fall-through.
   */
  async searchByCity(address, deadline) {
    const { localidade, uf } = address;
    if (!localidade) {
      return null;
    }
    const result = await this.geocodingProvider.searchStructured(
      {
        city: localidade,
        state: uf,
        country: CHURCH_CONSTANTS.GEOCODING_COUNTRY
      },
      deadline
    );
    if (isErr(result)) {
      return err(result.error);
    }
    return result.value ? ok(this.mapResponse(result.value)) : err(new CoordinatesNotFoundError());
  }
  /**
   * A hit terminates the chain; a NOT_FOUND (or empty) result falls through to
   * the next strategy; anything else is a real failure worth surfacing.
   */
  interpretSearch(result) {
    if (isErr(result)) {
      return result.error.failureMode === "NOT_FOUND" /* NOT_FOUND */ ? null : err(result.error);
    }
    return result.value ? ok(this.mapResponse(result.value)) : null;
  }
  mapResponse(coords) {
    return {
      userLat: coords.lat,
      userLon: coords.lon,
      precision: coords.precision,
      coordinatesProviderName: coords.providerName
    };
  }
};

// src/use-cases/errors/empty-church-list-error.ts
var EmptyChurchListError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.EMPTY_LIST, "NOT_FOUND" /* NOT_FOUND */, "PERMANENT" /* PERMANENT */);
  }
};

// src/use-cases/errors/no-nearby-churches-found-error.ts
var NoNearbyChurchesFoundError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_NEARBY_FOUND, "NOT_FOUND" /* NOT_FOUND */, "PERMANENT" /* PERMANENT */);
  }
};

// src/use-cases/churches/calculate-church-route-distances-use-case.ts
function maxDistanceFor(profile) {
  return ROUTING_MAX_DISTANCE_KM[profile ?? "pedestrian" /* PEDESTRIAN */];
}
function rankByDistance(churches, results, maxDistanceKm) {
  return results.map((_result, index) => {
    const result = results.at(index);
    if (result?.distance == null || result.status != null && result.status !== 0) {
      return null;
    }
    return {
      ...churches[index],
      distanceKm: result.distance,
      distanceMeters: result.distance * 1e3
    };
  }).filter((church) => church !== null && church.distanceKm <= maxDistanceKm).sort((firstChurch, secondChurch) => firstChurch.distanceKm - secondChurch.distanceKm);
}
var CalculateChurchRouteDistancesUseCase = class {
  constructor(routingProvider) {
    this.routingProvider = routingProvider;
  }
  routingProvider;
  async findNearest({ churches, user, deadline }, profile) {
    if (!churches.length) {
      return err(new EmptyChurchListError());
    }
    const routeResult = await this.routingProvider.getDistances({
      origin: { lat: user.userLat, lon: user.userLon },
      destinations: churches.map((church) => ({ lat: church.lat, lon: church.lon })),
      profile,
      deadline
    });
    if (isErr(routeResult)) {
      return routeResult;
    }
    const rankedChurches = rankByDistance(churches, routeResult.value, maxDistanceFor(profile));
    if (!rankedChurches.length) {
      return err(new NoNearbyChurchesFoundError());
    }
    return ok(rankedChurches);
  }
};

// src/lib/infra/cache/resilient-cache.ts
var import_node_crypto3 = __toESM(require("crypto"));

// src/messages/constants/logs/cache.ts
var CACHE_LOGS = {
  READ_ERROR: "Erro de leitura ou falha do Redis. Continuando sem cache.",
  WRITE_ERROR: "Falha ao escrever no Redis (n\xE3o fatal, continuando)",
  CORRUPTED_ENVELOPE: "Cache corrompida detectada: CacheEnvelope de sucesso sem valor",
  TTL_SKIP: "TTL <= 0, pulando escrita no cache"
};

// src/core/constants/time.ts
var SECONDS_PER_MINUTE = 60;
var DAYS_PER_WEEK = 7;
var DAYS_PER_YEAR = 365;
var MINUTES_PER_HOUR = 60;
var HOURS_PER_DAY = 24;
var SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;

// src/messages/constants/cache/cache.ts
var PERMANENT_TTL_MINUTES = 30;
var NEGATIVE_TTL_MINUTES = 30;
var CACHE_CONFIG = {
  /**
   * Ceiling for a single Redis round-trip inside a cached lookup.
   *
   * The cache used to read before its clock started and write after it stopped,
   * so a degraded Redis could add its own `commandTimeout` (1s) at each end on
   * top of the fetch budget. Both ends are now bounded by this instead.
   */
  REDIS_OP_BUDGET_MS: 300,
  /**
   * The single cache layer for the "find the nearest church" flow. Keyed by
   * CEP + routing profile and holding the finished church list — never
   * intermediate coordinates. FETCH_TIMEOUT_MS is the budget for the entire
   * chain (address -> geocode -> KNN -> routing matrix).
   */
  NEAREST_CHURCHES: {
    PREFIX: "cache:nearest-churches:",
    DEFAULT_TTL_SECONDS: SECONDS_PER_DAY * DAYS_PER_WEEK,
    /**
     * The CEP could not be resolved to coordinates (NOT_FOUND). This is the
     * negative cache that shields the address/geocoding APIs — ViaCEP,
     * BrasilAPI, AwesomeAPI, LocationIQ, Nominatim — from being re-asked about
     * a CEP that does not exist. A nonexistent CEP stays nonexistent, so this
     * is deliberately long; a day still lets a newly registered CEP through.
     */
    NOT_FOUND_TTL_SECONDS: SECONDS_PER_DAY,
    /**
     * Coordinates resolved fine, but no church qualifies (PERMANENT). This
     * depends on our own database rather than a third-party API, so it is kept
     * short: a newly registered church shows up within half an hour.
     */
    PERMANENT_TTL_SECONDS: SECONDS_PER_MINUTE * PERMANENT_TTL_MINUTES,
    /** Fallback for any other cacheable failure. */
    NEGATIVE_TTL_SECONDS: SECONDS_PER_MINUTE * NEGATIVE_TTL_MINUTES,
    MAX_PENDING_FETCHES: 500,
    /**
     * Ceiling for the shared fetch behind one key (address → geocode → KNN →
     * routing matrix).
     *
     * Deliberately just inside `HTTP_DEADLINE_POLICIES.churches.nearest` (8s):
     * the fetch is detached from any single caller, so it needs its own bound,
     * and giving up fractionally before the route budget means a waiting caller
     * sees the fetch's answer rather than its own timeout.
     *
     * Was 15s, which — with an unbounded Redis read and write at either end —
     * put the real ceiling near 17s for a synchronous client-facing GET.
     */
    FETCH_TIMEOUT_MS: 7500
  }
};

// src/errors/infrastructure/deadline-exceeded-error.ts
var DeadlineExceededError = class extends InfrastructureError {
  constructor(reason) {
    super(
      INFRA_ERRORS.DEADLINE_EXCEEDED,
      reason,
      "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
      "ABORTED" /* ABORTED */,
      "deadline_exceeded" /* DEADLINE_EXCEEDED */
    );
    this.name = "DeadlineExceededError";
  }
};

// src/core/shared/deadline.ts
var DEADLINE_EXPIRED_REASON = "DEADLINE_EXPIRED";
var NEVER_ABORTS = new AbortController().signal;
var NOOP = () => {
};
var MAX_TIMER_DELAY_MS = 2147483647;
var Deadline = class _Deadline {
  constructor(expiresAt, signal, clearTimer) {
    this.expiresAt = expiresAt;
    this.signal = signal;
    this.clearTimer = clearTimer;
  }
  expiresAt;
  signal;
  clearTimer;
  /**
   * Starts a fresh budget of `budgetMs`. A non-positive budget yields an
   * already-expired deadline rather than an error — callers check `expired`.
   *
   * `linkedTo` folds an external cancellation source (a client disconnect) into
   * the same signal, so consumers only ever watch one thing.
   */
  static in(budgetMs, options) {
    return _Deadline.until(Date.now() + Math.max(0, budgetMs), options?.linkedTo);
  }
  /**
   * A deadline that never expires, for callers with no budget to enforce —
   * workers, CLI entry points, and any layer invoked without one. Chosen over
   * `undefined` so downstream code has exactly one shape to handle.
   */
  static none() {
    return new _Deadline(Infinity, NEVER_ABORTS, NOOP);
  }
  static until(expiresAt, linkedTo) {
    if (!Number.isFinite(expiresAt)) {
      return linkedTo ? new _Deadline(Infinity, linkedTo, NOOP) : _Deadline.none();
    }
    const controller = new AbortController();
    const delay = Math.min(Math.max(0, expiresAt - Date.now()), MAX_TIMER_DELAY_MS);
    const timer = setTimeout(() => {
      controller.abort(DEADLINE_EXPIRED_REASON);
    }, delay);
    timer.unref();
    const signal = linkedTo ? AbortSignal.any([controller.signal, linkedTo]) : controller.signal;
    return new _Deadline(expiresAt, signal, () => {
      clearTimeout(timer);
    });
  }
  /** Milliseconds left, floored at 0. `Infinity` for an unbounded deadline. */
  remainingMs() {
    return Math.max(0, this.expiresAt - Date.now());
  }
  /**
   * True once there is no time left, or the budget was cancelled from outside.
   *
   * Prefer this over reading `signal.aborted`: a zero-length budget is expired
   * immediately, while its timer can only fire on a later tick.
   */
  get expired() {
    return this.signal.aborted || this.remainingMs() <= 0;
  }
  /**
   * A child budget of at most `maxMs`, expiring no later than this one.
   *
   * The child's signal fires on its own expiry *or* on the parent's, so
   * cancellation flows downwards through any depth of nesting.
   */
  derive(maxMs) {
    const cap = Number.isFinite(maxMs) ? Math.max(0, maxMs) : Infinity;
    const childExpiresAt = Math.min(this.expiresAt, Date.now() + cap);
    return _Deadline.until(childExpiresAt, this.signal);
  }
  /**
   * The error to return when this deadline stopped the work.
   *
   * Any falsy reason — not just a missing one — falls back to the generic
   * marker: an abort carrying `''` or `0` says nothing a reader could act on,
   * and would otherwise surface as an error with a blank cause.
   */
  asError() {
    return new DeadlineExceededError(this.signal.reason || DEADLINE_EXPIRED_REASON);
  }
  /**
   * Releases the timer. Naturally idempotent — `clearTimeout` on an already
   * cleared handle is a no-op — and safe to call on an expired deadline.
   * Disposal is not cancellation: it never aborts the signal.
   */
  dispose() {
    this.clearTimer();
  }
};

// src/core/shared/abort-race.ts
var import_node_events = require("events");
var toError = (reason) => {
  if (reason instanceof Error) return reason;
  return new Error(String(reason));
};
var resolveAbort = (onAbort, resolve, reject) => {
  try {
    Promise.resolve(onAbort()).then(resolve, reject);
  } catch (reason) {
    reject(reason);
  }
};
var resolveIfAlreadyAborted = (signal, onAbort) => {
  if (!signal.aborted) return void 0;
  try {
    return Promise.resolve(onAbort());
  } catch (reason) {
    return Promise.reject(toError(reason));
  }
};
function abortRace(promise, signal, onAbort) {
  const aborted = resolveIfAlreadyAborted(signal, onAbort);
  if (aborted) {
    promise.catch(() => void 0);
    return aborted;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const onResolve = (val) => {
      if (settled) return;
      settled = true;
      disposable[Symbol.dispose]();
      resolve(val);
    };
    const onReject = (err2) => {
      if (settled) return;
      settled = true;
      disposable[Symbol.dispose]();
      reject(toError(err2));
    };
    const disposable = (0, import_node_events.addAbortListener)(signal, () => {
      if (settled) return;
      settled = true;
      resolveAbort(onAbort, resolve, (reason) => {
        reject(toError(reason));
      });
    });
    promise.then(onResolve, onReject);
  });
}

// src/errors/infrastructure/service-overload-error.ts
var ServiceOverloadError = class extends InfrastructureError {
  constructor() {
    super(INFRA_ERRORS.SERVICE_OVERLOAD, void 0, "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */);
    this.name = "ServiceOverloadError";
  }
};

// src/errors/infrastructure/provider-failure-error.ts
var ProviderFailureError = class extends InfrastructureError {
  constructor(originalError) {
    super(
      {
        code: INFRA_ERRORS.PROVIDER_FAILURE.code,
        message: INFRA_ERRORS.PROVIDER_FAILURE.message
      },
      originalError,
      "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
      "RETRYABLE" /* RETRYABLE */,
      "provider_error" /* PROVIDER_ERROR */
    );
    this.name = "ProviderFailureError";
  }
};

// src/errors/infrastructure/circuit-open-error.ts
var CircuitOpenError = class extends InfrastructureError {
  provider;
  constructor(provider, reason) {
    super(
      INFRA_ERRORS.CIRCUIT_OPEN,
      reason,
      "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
      "RETRYABLE" /* RETRYABLE */,
      "circuit_open" /* CIRCUIT_OPEN */
    );
    this.name = "CircuitOpenError";
    this.provider = provider;
  }
};

// src/lib/infra/cache/resilient-cache.ts
var import_cockatiel = require("cockatiel");

// src/lib/metrics/cache-metrics.ts
var import_prom_client3 = require("prom-client");
var registry3 = getRegistry();
var collectMetricsCacheHits = registry3 ? new import_prom_client3.Counter({
  name: "cache_hits_total",
  help: "Cache envelope found in Redis (hit)",
  labelNames: ["prefix"],
  registers: [registry3]
}) : null;
var collectMetricsCacheMisses = registry3 ? new import_prom_client3.Counter({
  name: "cache_misses_total",
  help: "Cache miss, fetcher invoked",
  labelNames: ["prefix"],
  registers: [registry3]
}) : null;
var collectMetricsCacheErrors = registry3 ? new import_prom_client3.Counter({
  name: "cache_errors_total",
  help: "Redis read/write errors, corrupted envelopes",
  labelNames: ["prefix", "error_type"],
  registers: [registry3]
}) : null;
var collectMetricsCachePendingFetches = registry3 ? new import_prom_client3.Gauge({
  name: "cache_pending_fetches",
  help: "Current pendingFetches.size (circuit-breaker gauge)",
  labelNames: ["prefix"],
  registers: [registry3]
}) : null;
var collectMetricsCacheFetchDuration = registry3 ? new import_prom_client3.Histogram({
  name: "cache_fetch_duration_seconds",
  help: "Duration of the fetcher call",
  labelNames: ["prefix"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry3]
}) : null;
var collectMetricsCacheCircuitBreakerTrips = registry3 ? new import_prom_client3.Counter({
  name: "cache_circuit_breaker_trips_total",
  help: "Times pendingFetches >= MAX_PENDING",
  labelNames: ["prefix"],
  registers: [registry3]
}) : null;

// src/core/shared/stable-order.ts
function byCodeUnit(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// src/lib/infra/cache/cache-failure-policy.ts
var CacheFailurePolicy = class {
  constructor(options) {
    this.options = options;
  }
  options;
  /**
   * Whether a failure is too transient to be worth remembering.
   *
   * The default answers "anything that is not a deterministic statement about
   * this key". Only NOT_FOUND ("the resource does not exist") and PERMANENT
   * ("candidates existed, none qualify") will still be true in an hour. A
   * RETRYABLE blip, an ABORTED clock event, and — crucially — an untagged
   * SystemError or InfrastructureError all say something about *us* rather
   * than about the input, so caching them would pin an unrelated failure to a
   * perfectly good key for the whole negative TTL.
   *
   * Callers may still override via `options.isRetryable`;
   * `isRetryableChurchLookupError` states this same rule explicitly for the
   * nearest-church cache.
   */
  isRetryable(error) {
    if (this.options.isRetryable) {
      return this.options.isRetryable(error);
    }
    const failureMode = error.failureMode;
    return failureMode !== "NOT_FOUND" /* NOT_FOUND */ && failureMode !== "PERMANENT" /* PERMANENT */;
  }
  serialize(error) {
    if (this.options.serializeError) {
      return this.options.serializeError(error);
    }
    return {
      type: error.constructor?.name || "Error",
      message: error.message || String(error),
      data: error
    };
  }
  reconstruct(cached) {
    const deserialized = this.options.deserializeError?.(cached.type, cached.message, cached.data);
    if (deserialized) {
      return deserialized;
    }
    return new ProviderFailureError(`Cached Error: ${cached.type} - ${cached.message}`);
  }
  negativeTtlFor(error) {
    return this.options.negativeTtlFor?.(error) ?? this.options.negativeTtlSeconds;
  }
};

// src/lib/infra/cache/resilient-cache.ts
var DEFAULT_MAX_PENDING_FETCHES = 1e3;
var DEFAULT_TTL_JITTER_PERCENTAGE = 0.05;
async function withinBudget(work, deadline) {
  return abortRace(work, deadline.signal, () => void 0);
}
var ResilientCache = class {
  constructor(redis, options) {
    this.redis = redis;
    this.options = options;
    this.failures = new CacheFailurePolicy(options);
    this.MAX_PENDING = options.maxPendingFetches ?? DEFAULT_MAX_PENDING_FETCHES;
    this.FETCH_TIMEOUT = options.fetchTimeoutMs;
    this.JITTER_PERCENTAGE = options.ttlJitterPercentage ?? DEFAULT_TTL_JITTER_PERCENTAGE;
    this.limiter = (0, import_cockatiel.bulkhead)(this.MAX_PENDING);
    this.fetchPolicy = this.composeFetchPolicy();
  }
  redis;
  options;
  pendingFetches = /* @__PURE__ */ new Map();
  MAX_PENDING;
  FETCH_TIMEOUT;
  JITTER_PERCENTAGE;
  /** Concurrency limit on *shared fetches*, not on callers. */
  /** What a failure means, whether it is worth caching, and for how long. */
  failures;
  limiter;
  fetchPolicy;
  /**
   * Breaker outermost, bulkhead inside: an open circuit then rejects without
   * first occupying a concurrency slot it has no intention of using.
   *
   * The breaker counts *returned* failures, because `executeFetch` reports
   * trouble as `err(...)` rather than by throwing — and it counts only the
   * retryable ones. A NOT_FOUND is a real answer, and an ABORTED request says
   * the caller left; treating either as a fault would suspend a healthy
   * pipeline. A bulkhead rejection cannot trip it either: cockatiel rethrows
   * errors its filter does not handle, so they never reach the breaker's tally.
   */
  composeFetchPolicy() {
    const settings = this.options.circuitBreaker;
    if (!settings) {
      return this.limiter;
    }
    const breaker = (0, import_cockatiel.circuitBreaker)(
      (0, import_cockatiel.handleWhenResult)((result) => this.countsAsBreakerFailure(result)),
      {
        halfOpenAfter: settings.halfOpenAfterMs,
        breaker: new import_cockatiel.SamplingBreaker({
          threshold: settings.failureThreshold,
          duration: settings.samplingWindowMs,
          minimumRps: settings.minimumThroughput
        })
      }
    );
    return (0, import_cockatiel.wrap)(breaker, this.limiter);
  }
  countsAsBreakerFailure(result) {
    return isErr(result) && this.failures.isRetryable(result.error);
  }
  generateKey(params) {
    const stableString = Object.keys(params).filter((k) => params[k] != null && params[k] !== "").sort(byCodeUnit).map((k) => `${k}:${String(params[k])}`).join("|");
    const hash3 = import_node_crypto3.default.createHash("sha256").update(stableString).digest("hex");
    return `${this.options.prefix}${hash3}`;
  }
  /**
   * Serves `key` from cache, or runs `fetcher` once and remembers the answer.
   *
   * `parentDeadline` is this caller's own budget. Every Redis round-trip and
   * the fetch itself are bounded by it, so the whole call cannot outlast the
   * budget it was given — and, crucially, a caller can only ever cancel *its
   * own* wait: the shared fetch belongs to the cache.
   */
  async getOrFetch(key, fetcher, parentDeadline = Deadline.none()) {
    if (parentDeadline.expired) {
      return err(parentDeadline.asError());
    }
    const served = await this.serveWithoutFetching(key, parentDeadline);
    if (served) {
      return served;
    }
    return await this.startFetch(key, fetcher, parentDeadline);
  }
  /**
   * Everything that can answer without starting new work: an in-flight fetch to
   * join, or a stored envelope. Returns `null` when only a fetch will do.
   */
  async serveWithoutFetching(key, deadline) {
    const joined = await this.tryJoinPendingFetch(key, deadline);
    if (joined) {
      return joined;
    }
    const hit = await this.readHit(key, deadline);
    if (hit) {
      return hit;
    }
    return null;
  }
  /** Attaches to an in-flight fetch for `key`, or `null` if there is none. */
  async tryJoinPendingFetch(key, callerDeadline) {
    const pending = this.pendingFetches.get(key);
    if (!pending) {
      return null;
    }
    return await this.raceCaller(pending.promise, callerDeadline);
  }
  /**
   * Starts the one shared fetch for `key`.
   *
   * The fetch runs under a deadline of its own, detached from every caller, and
   * is deregistered only when it settles — never when a caller walks away, or a
   * later arrival would start a duplicate against the same upstream.
   */
  async startFetch(key, fetcher, callerDeadline) {
    const startedDuringRead = this.pendingFetches.get(key);
    if (startedDuringRead) {
      return await this.raceCaller(startedDuringRead.promise, callerDeadline);
    }
    collectMetricsCacheMisses?.inc({ prefix: this.options.prefix });
    const fetchDeadline = Deadline.in(this.FETCH_TIMEOUT);
    const shared = this.guardedFetch(key, fetcher, fetchDeadline);
    this.pendingFetches.set(key, { promise: shared, deadline: fetchDeadline });
    this.reportPendingSize();
    void shared.catch(() => void 0).finally(() => {
      this.pendingFetches.delete(key);
      this.reportPendingSize();
    });
    return await this.raceCaller(shared, callerDeadline);
  }
  /**
   * The shared fetch, behind the concurrency limit and the breaker.
   *
   * The guard sits here — around the one shared fetch — rather than around each
   * caller. Callers that merely join an in-flight fetch, or that are answered
   * from Redis, cost the upstream nothing and must not consume a slot; putting
   * the bulkhead at the entry point would count them and quietly shrink the
   * effective limit to "callers" instead of "fetches".
   */
  async guardedFetch(key, fetcher, fetchDeadline) {
    try {
      return await this.fetchPolicy.execute(() => this.executeFetch(key, fetcher, fetchDeadline));
    } catch (error) {
      return this.mapPolicyRejection(error, fetchDeadline);
    }
  }
  /**
   * Translates a refusal by the limiter or the breaker into this cache's
   * vocabulary.
   *
   * `executeFetch` is total — it converts every throw into an `err(...)` — so
   * the only errors that can reach here are the policies' own rejections. The
   * final fallback is therefore defensive, and mutating the `BrokenCircuitError`
   * check to `true` survives mutation testing as an equivalent mutant. It is
   * kept rather than removed so that an unexpected throw still returns a Result
   * instead of escaping as a rejection.
   */
  mapPolicyRejection(error, fetchDeadline) {
    if (error instanceof import_cockatiel.BulkheadRejectedError) {
      collectMetricsCacheCircuitBreakerTrips?.inc({ prefix: this.options.prefix });
      return err(new ServiceOverloadError());
    }
    if (error instanceof import_cockatiel.BrokenCircuitError) {
      collectMetricsCacheCircuitBreakerTrips?.inc({ prefix: this.options.prefix });
      return err(new CircuitOpenError(this.options.prefix, error));
    }
    return this.mapFetchThrow(error, fetchDeadline);
  }
  /**
   * Waits on the shared fetch, but only for as long as *this* caller's budget
   * allows. Giving up here neither cancels the fetch nor affects anyone else.
   */
  async raceCaller(shared, callerDeadline) {
    return abortRace(shared, callerDeadline.signal, () => err(callerDeadline.asError()));
  }
  reportPendingSize() {
    collectMetricsCachePendingFetches?.set({ prefix: this.options.prefix }, this.pendingFetches.size);
  }
  /**
   * Runs the fetcher under the shared budget.
   *
   * A fetcher that honours its deadline settles on its own; racing the budget
   * as well guarantees settlement even for one that ignores it, so a hung
   * upstream cannot pin an entry in `pendingFetches` forever. Both use the
   * deadline's single timer — there is no second clock.
   */
  async executeFetch(key, fetcher, fetchDeadline) {
    const endTimer = collectMetricsCacheFetchDuration?.startTimer({ prefix: this.options.prefix });
    try {
      const outcome = await abortRace(
        fetcher(fetchDeadline).then((value) => ({ settled: true, value })),
        fetchDeadline.signal,
        () => ({ settled: false })
      );
      if (!outcome.settled) {
        return err(fetchDeadline.asError());
      }
      return await this.cacheAndReturn(key, outcome.value);
    } catch (error) {
      return this.mapFetchThrow(error, fetchDeadline);
    } finally {
      endTimer?.();
      fetchDeadline.dispose();
    }
  }
  mapFetchThrow(error, fetchDeadline) {
    if (fetchDeadline.expired) {
      return err(fetchDeadline.asError());
    }
    if (error instanceof AppError) {
      return err(error);
    }
    return err(new ProviderFailureError(error));
  }
  async readHit(key, deadline) {
    const envelope = await this.readEnvelope(key, deadline);
    return envelope ? this.unwrapEnvelope(key, envelope) : null;
  }
  /** Reads and parses the envelope at `key`. Any failure is a miss, never a throw. */
  async readEnvelope(key, deadline) {
    const cached = await this.readRaw(key, deadline);
    if (!cached) {
      return null;
    }
    try {
      return JSON.parse(cached);
    } catch (error) {
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: "corrupted" });
      logger.warn({ err: error, key }, CACHE_LOGS.READ_ERROR);
      return null;
    }
  }
  /** The Redis GET, bounded by the caller's budget so a slow cache cannot eat it. */
  async readRaw(key, deadline) {
    const readDeadline = deadline.derive(CACHE_CONFIG.REDIS_OP_BUDGET_MS);
    try {
      return await withinBudget(this.redis.get(key), readDeadline);
    } catch (error) {
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: "read" });
      logger.warn({ err: error, key }, CACHE_LOGS.READ_ERROR);
      return null;
    } finally {
      readDeadline.dispose();
    }
  }
  /** Turns a stored envelope into a Result, or null to fall through to a fetch. */
  unwrapEnvelope(key, envelope) {
    if (envelope.s) {
      return this.unwrapSuccess(key, envelope);
    }
    if (!envelope.e) {
      return null;
    }
    collectMetricsCacheHits?.inc({ prefix: this.options.prefix });
    return err(this.failures.reconstruct(envelope.e));
  }
  unwrapSuccess(key, envelope) {
    const prefix = this.options.prefix;
    if (!("v" in envelope)) {
      collectMetricsCacheErrors?.inc({ prefix, error_type: "corrupted" });
      logger.error({ key, envelope }, CACHE_LOGS.CORRUPTED_ENVELOPE);
      return err(new ProviderFailureError("Corrupted Cache: Missing value"));
    }
    collectMetricsCacheHits?.inc({ prefix });
    return ok(envelope.v);
  }
  async cacheAndReturn(key, result) {
    if (isErr(result)) {
      const error = result.error;
      if (!this.failures.isRetryable(error)) {
        await this.setResult(key, { s: false, e: this.failures.serialize(error) }, this.failures.negativeTtlFor(error));
      }
      return err(error);
    }
    await this.setResult(key, { s: true, v: result.value }, this.options.defaultTtlSeconds);
    return ok(result.value);
  }
  async setResult(key, envelope, baseTtl) {
    if (baseTtl <= 0) {
      logger.debug({ key }, CACHE_LOGS.TTL_SKIP);
      return;
    }
    const writeDeadline = Deadline.in(CACHE_CONFIG.REDIS_OP_BUDGET_MS);
    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE);
      const randomOffset = import_node_crypto3.default.randomInt(-jitterAmount, jitterAmount + 1);
      const finalTtl = Math.max(1, baseTtl + randomOffset);
      await withinBudget(this.redis.set(key, JSON.stringify(envelope), "EX", finalTtl), writeDeadline);
    } catch (error) {
      collectMetricsCacheErrors?.inc({ prefix: this.options.prefix, error_type: "write" });
      logger.warn({ err: error, key }, CACHE_LOGS.WRITE_ERROR);
    } finally {
      writeDeadline.dispose();
    }
  }
};

// src/core/projections/public-church.ts
function toPublicNearbyChurch(church) {
  return {
    publicId: church.publicId,
    name: church.name,
    address: church.address,
    lat: church.lat,
    lon: church.lon,
    distanceKm: church.distanceKm,
    distanceMeters: church.distanceMeters
  };
}
function toPublicNearbyChurches(churches) {
  return churches.map(toPublicNearbyChurch);
}

// src/use-cases/churches/find-nearest-churches-use-case.ts
var FindNearestChurchesUseCase = class {
  constructor(cepToLatLonUseCase, findNearbyChurchesKnnUseCase, calculateChurchRouteDistancesUseCase, cache) {
    this.cepToLatLonUseCase = cepToLatLonUseCase;
    this.findNearbyChurchesKnnUseCase = findNearbyChurchesKnnUseCase;
    this.calculateChurchRouteDistancesUseCase = calculateChurchRouteDistancesUseCase;
    this.cacheManager = new ResilientCache(cache.redis, cache.options);
    this.defaultProfile = cache.defaultProfile ?? "pedestrian" /* PEDESTRIAN */;
  }
  cepToLatLonUseCase;
  findNearbyChurchesKnnUseCase;
  calculateChurchRouteDistancesUseCase;
  cacheManager;
  defaultProfile;
  async execute({
    cep,
    deadline = Deadline.none()
  }) {
    const cleanCep = cep.replace(/\D/g, "");
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep, profile: this.defaultProfile });
    return await this.cacheManager.getOrFetch(
      cacheKey,
      (fetchDeadline) => this.computeNearestChurches(cleanCep, fetchDeadline),
      deadline
    );
  }
  /**
   * Runs only on a cache miss. Every step receives the cache layer's budget, so
   * the whole chain shares one clock and each leg derives its own timeout from
   * whatever is left of it.
   */
  async computeNearestChurches(cleanCep, deadline) {
    const cepResult = await this.cepToLatLonUseCase.execute({ cep: cleanCep, deadline });
    if (isErr(cepResult)) {
      return err(cepResult.error);
    }
    const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value;
    const knnResult = await this.findNearbyChurchesKnnUseCase.execute({ userLat, userLon, deadline });
    if (isErr(knnResult)) {
      return err(knnResult.error);
    }
    const { churches, totalFound } = knnResult.value;
    const nearestChurchesResult = await this.rankByRouteDistance(churches, { userLat, userLon }, deadline);
    if (isErr(nearestChurchesResult)) {
      return err(nearestChurchesResult.error);
    }
    return ok({
      nearestChurchesInfo: toPublicNearbyChurches(nearestChurchesResult.value),
      totalFound,
      precision,
      coordinatesProviderName
    });
  }
  async rankByRouteDistance(churches, user, deadline) {
    return await this.calculateChurchRouteDistancesUseCase.findNearest(
      { churches, user, deadline },
      this.defaultProfile
    );
  }
};

// src/use-cases/errors/latitude-range-error.ts
var LatitudeRangeError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LATITUDE_OUT_OF_RANGE, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/errors/longitude-range-error.ts
var LongitudeRangeError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LONGITUDE_OUT_OF_RANGE, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/core/constants/geo.ts
var MIN_LATITUDE = -90;
var MAX_LATITUDE = 90;
var MIN_LONGITUDE = -180;
var MAX_LONGITUDE = 180;
var DEGREES_IN_HALF_TURN = 180;
var DEGREES_TO_RADIANS = Math.PI / DEGREES_IN_HALF_TURN;
var METERS_PER_KILOMETER = 1e3;
var DISTANCE_DECIMAL_PLACES = 15;

// src/use-cases/churches/find-nearby-churches-knn-use-case.ts
function validateCoordinates(userLat, userLon) {
  if (userLat < MIN_LATITUDE || userLat > MAX_LATITUDE) {
    return err(new LatitudeRangeError());
  }
  if (userLon < MIN_LONGITUDE || userLon > MAX_LONGITUDE) {
    return err(new LongitudeRangeError());
  }
  return null;
}
function knnTimeoutMs(deadline) {
  const remaining = deadline.remainingMs();
  return remaining === Infinity ? void 0 : Math.min(CHURCH_CONSTANTS.KNN_BUDGET_MS, remaining);
}
var FindNearbyChurchesKnnUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  churchesRepository;
  async execute({
    userLat,
    userLon,
    deadline = Deadline.none()
  }) {
    const invalidCoordinates = validateCoordinates(userLat, userLon);
    if (invalidCoordinates) {
      return invalidCoordinates;
    }
    if (deadline.expired) {
      return err(deadline.asError());
    }
    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: CHURCH_CONSTANTS.KNN_LIMIT,
      timeoutMs: knnTimeoutMs(deadline)
    });
    if (isErr(result)) {
      return result;
    }
    const churches = result.value;
    return ok({
      churches,
      totalFound: churches.length
    });
  }
};

// src/use-cases/errors/church-not-found-error.ts
var ChurchNotFoundError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/create-church-error.ts
var CreateChurchError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.CREATE_FAILED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/repositories/prisma/prisma-churches-repository.ts
var KNN_MIN_CANDIDATES = 100;
var KNN_CANDIDATE_MULTIPLIER = 5;
var KNN_SQL = `
        WITH knn_candidates AS (
          -- Phase 1: Fast KNN pre-filtering using bounding box approximations
          SELECT id, geog
          FROM churches
          WHERE geog IS NOT NULL
          ORDER BY geog <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          LIMIT $4  -- Get more candidates than needed for accuracy
        )
        -- Phase 2: Exact distance calculation and sorting on the smaller candidate set
        SELECT
          c.id,
          c.public_id as "publicId",
          c.name,
          c.address,
          c.lat,
          c.lon,
          ST_Distance(
            c.geog,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          ) as "distanceMeters"
        FROM knn_candidates knn
        JOIN churches c ON c.id = knn.id
        ORDER BY ST_Distance(
          c.geog,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) ASC
        LIMIT $3  -- Final accurate results
      `;
function toStatementTimeout(timeoutMs) {
  return Math.max(1, Math.floor(timeoutMs));
}
function insertChurch(data) {
  return prisma.$queryRaw`
        INSERT INTO churches (public_id, name, address, lat, lon, created_at, updated_at)
        VALUES (
          gen_random_uuid()::text,
          ${data.name},
          ${data.address},
          ${data.lat},
          ${data.lon},
          NOW(),
          NOW()
          )
        RETURNING
          id,
          public_id AS "publicId",
          name,
          address,
          lat,
          lon,
          geog::text AS geog,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
}
function toNearbyChurch(church) {
  return {
    ...church,
    distanceMeters: Number.parseFloat(church.distanceMeters.toFixed(DISTANCE_DECIMAL_PLACES)),
    distanceKm: Number.parseFloat((church.distanceMeters / METERS_PER_KILOMETER).toFixed(DISTANCE_DECIMAL_PLACES))
  };
}
var PrismaChurchesRepository = class {
  constructor(errorMapper) {
    this.errorMapper = errorMapper;
  }
  errorMapper;
  async findNearest({
    userLat,
    userLon,
    limit = 20,
    timeoutMs
  }) {
    try {
      const churches = await this.runKnnQuery(userLat, userLon, limit, timeoutMs);
      return ok(churches.map(toNearbyChurch));
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  /**
   * Runs the KNN search, optionally under a Postgres-enforced ceiling.
   *
   * The driver cannot cancel a statement that is already executing, so a
   * request budget means nothing to this leg unless the database itself
   * enforces it. `SET LOCAL` only applies inside a transaction, which is why
   * the bounded path costs a BEGIN/COMMIT the unbounded one does not — so the
   * transaction is taken only when a ceiling was actually asked for.
   */
  async runKnnQuery(userLat, userLon, limit, timeoutMs) {
    const knnCandidates = Math.max(KNN_MIN_CANDIDATES, limit * KNN_CANDIDATE_MULTIPLIER);
    if (timeoutMs === void 0) {
      return await prisma.$queryRawUnsafe(KNN_SQL, userLat, userLon, limit, knnCandidates);
    }
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${toStatementTimeout(timeoutMs)}`);
      return await tx.$queryRawUnsafe(KNN_SQL, userLat, userLon, limit, knnCandidates);
    });
  }
  async findByParams(params) {
    try {
      const results = await prisma.$queryRaw`
        SELECT
          id,
          public_id as "publicId",
          name,
          address,
          lat,
          lon,
          geog::text as geog,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM churches
        WHERE 
          lower(trim(name)) = lower(trim(${params.name}))
          OR
          (
            round(lat::numeric, 6) = round(${params.lat}::numeric, 6)
            AND
            round(lon::numeric, 6) = round(${params.lon}::numeric, 6)
          )
        LIMIT 1
      `;
      return ok(results[0] ?? null);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async findByName(name) {
    try {
      const results = await prisma.$queryRaw`
        SELECT
          id,
          public_id as "publicId",
          name,
          address,
          lat,
          lon,
          geog::text as geog,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM churches
        WHERE lower(trim(name)) = lower(trim(${name}))
        LIMIT 1
      `;
      return ok(results[0] ?? null);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async createChurch(data) {
    try {
      const inserted = await insertChurch(data);
      const church = inserted.at(0);
      if (!church) {
        return err(new CreateChurchError());
      }
      return ok(church);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async deleteChurchByPublicId(publicId) {
    try {
      const rows = await prisma.$queryRaw`
        DELETE FROM churches 
        WHERE public_id = ${publicId}
        RETURNING
          id,
          public_id AS "publicId",
          name,
          address,
          lat,
          lon,
          geog::text AS geog,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      const church = rows.at(0);
      if (!church) {
        return err(new ChurchNotFoundError());
      }
      return ok(church);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
};

// src/use-cases/errors/church-already-exists-error.ts
var ChurchAlreadyExistsError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.ALREADY_EXISTS, "CONFLICT" /* CONFLICT */);
  }
};

// src/repositories/prisma/errors/churches-error-mapping.ts
var churchPrismaErrorMapping = {
  P2002: () => new ChurchAlreadyExistsError(),
  // Unique constraint violation (create)
  P2025: () => new ChurchNotFoundError()
  // Record not found (delete/update)
};

// src/messages/errors/geolocation.ts
var GEO_ERRORS = {
  NO_PROVIDER: {
    code: "NO_GEO_PROVIDER",
    message: "Provedor resiliente de geolocaliza\xE7\xE3o requer pelo menos um provedor de geolocaliza\xE7\xE3o configurado."
  },
  NO_ADDRESS_PROVIDER: {
    code: "NO_ADDRESS_PROVIDER",
    message: "Provedor resiliente de endere\xE7o requer pelo menos um provedor de endere\xE7o configurado."
  },
  ADDRESS_PROVIDER_FAILURE: {
    code: "ADDRESS_PROVIDER_FAILURE",
    message: "Falha no provedor de endere\xE7os."
  },
  TIMEOUT_EXCEEDED: {
    code: "TIMEOUT_EXCEEDED",
    message: "Tempo limite excedido ao buscar dados nos provedores externos."
  }
};

// src/providers/address-provider/error/no-address-provider-error.ts
var NoAddressProviderError = class extends InfrastructureError {
  constructor() {
    super(GEO_ERRORS.NO_ADDRESS_PROVIDER);
  }
};

// src/lib/metrics/provider-metrics.ts
var import_prom_client4 = require("prom-client");
var registry4 = getRegistry();
var collectMetricsProviderRequest = registry4 ? new import_prom_client4.Counter({
  name: "provider_request_total",
  help: "Per-provider request outcomes",
  labelNames: ["provider", "layer", "result"],
  registers: [registry4]
}) : null;
var collectMetricsProviderFallback = registry4 ? new import_prom_client4.Counter({
  name: "provider_fallback_total",
  help: "Fallback transitions between providers in a chain",
  labelNames: ["layer", "from_provider", "to_provider"],
  registers: [registry4]
}) : null;
var collectMetricsProviderChainExhausted = registry4 ? new import_prom_client4.Counter({
  name: "provider_chain_exhausted_total",
  help: "All providers in a chain failed with infrastructure errors",
  labelNames: ["layer"],
  registers: [registry4]
}) : null;
var collectMetricsProviderLatency = registry4 ? new import_prom_client4.Histogram({
  name: "provider_latency_seconds",
  help: "Individual provider response time",
  labelNames: ["provider", "layer"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry4]
}) : null;
function recordProviderRequest(layer, provider, outcome) {
  let result;
  if (isOk(outcome)) {
    result = outcome.value == null ? "not_found" /* NOT_FOUND */ : "success";
  } else {
    result = outcome.error.telemetryReason ?? "unknown" /* UNKNOWN */;
  }
  collectMetricsProviderRequest?.inc({ provider, layer, result });
}

// src/providers/helpers/provider-chain.ts
function providerNameOf(provider) {
  return provider.providerName ?? provider.constructor.name;
}
async function runProviderChain(run) {
  const tally = { notFoundCount: 0 };
  for (const [index, provider] of run.providers.entries()) {
    if (run.deadline.expired) {
      return err(run.deadline.asError());
    }
    const providerName = providerNameOf(provider);
    const result = await callProvider(run, provider, providerName);
    const terminal = interpret(run, result, providerName, index, tally);
    if (terminal) {
      return terminal;
    }
  }
  return decideExhausted(run, tally);
}
async function callProvider(run, provider, providerName) {
  const endTimer = collectMetricsProviderLatency?.startTimer({ provider: providerName, layer: run.layer });
  const result = await run.attempt(provider, run.deadline);
  endTimer?.();
  recordProviderRequest(run.layer, providerName, result);
  return result;
}
function interpret(run, result, providerName, index, tally) {
  if (isOk(result)) {
    return interpretSuccess(run, result.value, providerName, tally);
  }
  const error = result.error;
  if (error.failureMode === "NOT_FOUND" /* NOT_FOUND */) {
    tally.notFoundCount++;
    run.narrator.notFound(providerName);
    return null;
  }
  if (error.failureMode === "RETRYABLE" /* RETRYABLE */) {
    noteRetryable(run, error, providerName, index, tally);
    return null;
  }
  run.narrator.fatal(providerName, error);
  return err(error);
}
function interpretSuccess(run, value, providerName, tally) {
  if (value === null) {
    tally.notFoundCount++;
    run.narrator.emptyResult(providerName);
    return null;
  }
  run.narrator.success(providerName);
  return ok(value);
}
function noteRetryable(run, error, providerName, index, tally) {
  tally.lastRetryableError = error;
  tally.lastProviderName = providerName;
  const nextProvider = run.providers.at(index + 1);
  if (nextProvider) {
    collectMetricsProviderFallback?.inc({
      layer: run.layer,
      from_provider: providerName,
      to_provider: providerNameOf(nextProvider)
    });
  }
  run.narrator.retryable(providerName, index + 1, error);
}
function decideExhausted(run, tally) {
  if (tally.notFoundCount === run.providers.length) {
    run.narrator.allNotFound(tally.notFoundCount, run.providers.length);
    return err(run.allNotFoundError());
  }
  collectMetricsProviderChainExhausted?.inc({ layer: run.layer });
  if (tally.lastRetryableError) {
    run.narrator.systemFailure(tally.lastProviderName, tally.notFoundCount, tally.lastRetryableError);
    return err(tally.lastRetryableError);
  }
  return err(new ProviderFailureError("TODOS os provedores falharam"));
}

// src/providers/address-provider/resilient-address-provider.ts
function perProviderEvents(cleanCep) {
  return {
    success(providerName) {
      logger.info({ provider: providerName }, "Endere\xE7o obtido com sucesso por um provedor de endere\xE7o");
    },
    emptyResult(providerName) {
      logger.info({ provider: providerName }, "Provedor retornou null (n\xE3o encontrado) - tentando pr\xF3ximo");
    },
    notFound(providerName) {
      logger.info(
        { provider: providerName, cep: cleanCep },
        "Provedor confirmou que o recurso n\xE3o existe - tentando pr\xF3ximo"
      );
    },
    retryable(providerName, attempt, error) {
      logger.warn(
        { provider: providerName, attempt, error },
        "Provedor de endere\xE7o retornou erro recuper\xE1vel. Alternando para o pr\xF3ximo provedor..."
      );
    },
    fatal(providerName, error) {
      logger.error({ provider: providerName, error }, "Provedor retornou erro fatal. Abortando cadeia.");
    }
  };
}
function chainOutcomeEvents(cleanCep) {
  return {
    allNotFound(notFoundCount, totalProviders) {
      logger.warn(
        { cep: cleanCep, notFoundCount, totalProviders },
        "TODOS os provedores confirmaram CEP inv\xE1lido/n\xE3o encontrado"
      );
    },
    systemFailure(providerName, notFoundCount, error) {
      logger.error(
        { cep: cleanCep, provider: providerName, notFoundCount, error },
        "Provedores de endere\xE7o falharam com erros de sistema"
      );
    }
  };
}
function addressNarrator(cleanCep) {
  return { ...perProviderEvents(cleanCep), ...chainOutcomeEvents(cleanCep) };
}
var ResilientAddressProvider = class {
  constructor(providers) {
    this.providers = providers;
    if (this.providers.length === 0) {
      throw new NoAddressProviderError();
    }
  }
  providers;
  async fetchAddress(cep, deadline = Deadline.none()) {
    const cleanCep = cep.replace(/\D/g, "");
    return await runProviderChain({
      providers: this.providers,
      layer: "address",
      narrator: addressNarrator(cleanCep),
      allNotFoundError: () => new InvalidCepError(),
      attempt: async (provider, inner) => await provider.fetchAddress(cleanCep, inner),
      deadline
    });
  }
};

// src/lib/http/axios.ts
var import_axios = __toESM(require("axios"));

// src/lib/http/https-agent.ts
var import_node_https = __toESM(require("https"));
var agents = /* @__PURE__ */ new Map();
var DEFAULT_CONFIG = {
  keepAlive: true,
  keepAliveMsecs: 1e3,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: 3e4,
  scheduling: "lifo"
};
var getHttpsAgent = (options = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...options };
  const key = JSON.stringify(finalConfig, Object.keys(finalConfig).sort(byCodeUnit));
  if (!agents.has(key)) {
    agents.set(key, new import_node_https.default.Agent(finalConfig));
  }
  return agents.get(key);
};
var sharedHttpsAgent = getHttpsAgent();

// src/lib/http/axios.ts
var AXIOS_DEFAULT_TIMEOUT_MS = 6e4;
var createHttpClient = (config = {}) => {
  const { agentOptions, ...axiosConfig } = config;
  const httpsAgent = agentOptions ? getHttpsAgent(agentOptions) : sharedHttpsAgent;
  return import_axios.default.create({
    httpsAgent,
    // Default request timeout (distinct from socket timeout)
    timeout: config.timeout ?? AXIOS_DEFAULT_TIMEOUT_MS,
    ...axiosConfig
  });
};

// src/messages/constants/providers/shared.ts
var SHARED_PROVIDER_DEFAULTS = {
  HTTPS_AGENT: {
    KEEP_ALIVE_MSECS: 1e3,
    MAX_SOCKETS: 100,
    MAX_FREE_SOCKETS: 10,
    TIMEOUT_MS: 3e4
  },
  USER_AGENT: "EvangelismoDigitalBackend/1.0",
  USER_AGENT_WITH_CONTACT: "EvangelismoDigitalBackend/1.0 (contact@findhope.digital)"
};

// src/providers/helpers/provider-http-client.ts
function createProviderHttpClient(params) {
  const { baseURL, timeoutMs, userAgent, extra } = params;
  return createHttpClient({
    baseURL,
    timeout: timeoutMs,
    headers: {
      "User-Agent": userAgent ?? SHARED_PROVIDER_DEFAULTS.USER_AGENT
    },
    agentOptions: {
      keepAliveMsecs: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.KEEP_ALIVE_MSECS,
      maxSockets: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.MAX_SOCKETS,
      maxFreeSockets: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.MAX_FREE_SOCKETS,
      timeout: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.TIMEOUT_MS
    },
    ...extra
  });
}

// src/lib/infra/rate-limiter/redis-rate-limiter.ts
var import_rate_limiter_flexible = require("rate-limiter-flexible");

// src/messages/constants/logs/rate-limiter.ts
var RATE_LIMITER_LOGS = {
  INFRA_DEGRADED: "RedisRateLimiter com erro: Redis n\xE3o dispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open).",
  INFRA_STILL_DEGRADED: "RedisRateLimiter continua degradado: Redis indispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open).",
  INFRA_RECOVERED: "RedisRateLimiter restabelecido: Redis dispon\xEDvel novamente.",
  TOO_MANY_LIMITERS: "ALERTA: Muitos RateLimiters instanciados. Verifique se providers est\xE3o est\xE1ticos.",
  NO_INSTANCE_TO_DESTROY: "Nenhuma inst\xE2ncia de RedisRateLimiter para destruir.",
  HTTP_INFRA_DEGRADED: "Rate limit HTTP degradado: Redis indispon\xEDvel, o limite de entrada est\xE1 sendo IGNORADO (fail-open).",
  HTTP_INFRA_STILL_DEGRADED: "Rate limit HTTP continua degradado: Redis indispon\xEDvel, o limite de entrada segue sendo IGNORADO (fail-open).",
  HTTP_INFRA_RECOVERED: "Rate limit HTTP restabelecido: Redis dispon\xEDvel, o limite de entrada voltou a ser aplicado."
};

// src/lib/infra/rate-limiter/outage-reporter.ts
var DEFAULT_OUTAGE_WARN_INTERVAL_MS = 3e4;
var OutageReporter = class {
  constructor(options) {
    this.options = options;
    this.warnIntervalMs = options.warnIntervalMs ?? DEFAULT_OUTAGE_WARN_INTERVAL_MS;
  }
  options;
  startedAt = null;
  lastWarnAt = 0;
  suppressedLogs = 0;
  warnIntervalMs;
  /** True while an episode is open. Exposed for callers that report health. */
  get degraded() {
    return this.startedAt !== null;
  }
  /** Record a request that had to fall back. Always counts; logs on a schedule. */
  failed(context, error) {
    this.options.onDegraded?.(context);
    const now = Date.now();
    if (this.startedAt === null) {
      this.startEpisode(context, error, now);
      return;
    }
    if (now - this.lastWarnAt >= this.warnIntervalMs) {
      this.warnStillDegraded(context, error, now);
      return;
    }
    this.suppressedLogs += 1;
  }
  /** Record a request that succeeded. Closes the episode if one was open. */
  succeeded(context) {
    if (this.startedAt === null) {
      return;
    }
    this.options.onRecovered?.(context);
    logger.info(
      {
        ...context,
        outageDurationMs: Date.now() - this.startedAt,
        suppressedLogs: this.suppressedLogs
      },
      this.options.messages.recovered
    );
    this.reset();
  }
  /** Drops any open episode without logging a recovery. For teardown only. */
  reset() {
    this.startedAt = null;
    this.lastWarnAt = 0;
    this.suppressedLogs = 0;
  }
  startEpisode(context, error, now) {
    this.startedAt = now;
    this.lastWarnAt = now;
    this.suppressedLogs = 0;
    logger.warn({ ...context, mode: "fail-open", redisOutage: true, err: error }, this.options.messages.degraded);
  }
  warnStillDegraded(context, error, now) {
    logger.warn(
      {
        ...context,
        mode: "fail-open",
        redisOutage: true,
        outageDurationMs: now - (this.startedAt ?? now),
        suppressedLogs: this.suppressedLogs,
        err: error
      },
      this.options.messages.stillDegraded
    );
    this.lastWarnAt = now;
    this.suppressedLogs = 0;
  }
};
function asLoggableError(error) {
  return typeof error === "object" && error !== null ? error : { error };
}

// src/lib/metrics/rate-limiter-metrics.ts
var import_prom_client5 = require("prom-client");
var registry5 = getRegistry();
var collectMetricsRateLimiterConsumed = registry5 ? new import_prom_client5.Counter({
  name: "rate_limiter_consumed_total",
  help: "Successful consume (point granted)",
  labelNames: ["provider"],
  registers: [registry5]
}) : null;
var collectMetricsRateLimiterRejected = registry5 ? new import_prom_client5.Counter({
  name: "rate_limiter_rejected_total",
  help: "Rate limit exceeded (no points remaining)",
  labelNames: ["provider"],
  registers: [registry5]
}) : null;
var collectMetricsRateLimiterInfraDegraded = registry5 ? new import_prom_client5.Counter({
  name: "rate_limiter_infra_degraded_total",
  help: "Fail-open events (Redis down, traffic allowed)",
  labelNames: ["provider"],
  registers: [registry5]
}) : null;
var collectMetricsRateLimiterInfraRecovered = registry5 ? new import_prom_client5.Counter({
  name: "rate_limiter_infra_recovered_total",
  help: "Recovery from degraded state",
  labelNames: ["provider"],
  registers: [registry5]
}) : null;
var collectMetricsHttpRateLimitRedisUp = registry5 ? new import_prom_client5.Gauge({
  name: "http_rate_limit_redis_up",
  help: "1 when Redis can serve ingress rate limiting, 0 while the limit is being skipped",
  labelNames: ["subsystem"],
  registers: [registry5]
}) : null;
var collectMetricsHttpRateLimitDegraded = registry5 ? new import_prom_client5.Counter({
  name: "http_rate_limit_infra_degraded_total",
  help: "Health-probe observations of a Redis that cannot serve ingress rate limiting",
  labelNames: ["subsystem"],
  registers: [registry5]
}) : null;
var collectMetricsHttpRateLimitRecovered = registry5 ? new import_prom_client5.Counter({
  name: "http_rate_limit_infra_recovered_total",
  help: "Transitions of ingress rate limiting back to enforced",
  labelNames: ["subsystem"],
  registers: [registry5]
}) : null;

// src/lib/infra/rate-limiter/redis-rate-limiter.ts
var LIMITER_COUNT_WARN_THRESHOLD = 50;
var DEFAULT_PROVIDER_LIMIT = { points: 10, windowSeconds: 1 };
var RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS = Number(
  process.env.REDIS_LOG_OUTAGE_INTERVAL_MS ?? DEFAULT_OUTAGE_WARN_INTERVAL_MS
);
function isRateLimitRejection(error) {
  return typeof error === "object" && error !== null && "remainingPoints" in error && typeof error.remainingPoints === "number";
}
var RedisRateLimiter = class _RedisRateLimiter {
  static instance;
  /**
   * One episode across every provider: a Redis outage is an outage, and six
   * providers noticing it separately would be six alarms for one fact.
   */
  static outage = new OutageReporter({
    messages: {
      degraded: RATE_LIMITER_LOGS.INFRA_DEGRADED,
      stillDegraded: RATE_LIMITER_LOGS.INFRA_STILL_DEGRADED,
      recovered: RATE_LIMITER_LOGS.INFRA_RECOVERED
    },
    warnIntervalMs: RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS,
    onDegraded: ({ provider }) => collectMetricsRateLimiterInfraDegraded?.inc({ provider: String(provider) }),
    onRecovered: ({ provider }) => collectMetricsRateLimiterInfraRecovered?.inc({ provider: String(provider) })
  });
  redis;
  // 1 limiter por provider
  limiters = /* @__PURE__ */ new Map();
  /**
   * Central de configuração dos providers
   */
  providerConfigs = {
    ["awesomeApiAddressProvider" /* AWESOME_API_ADDRESS */]: {
      points: 5,
      windowSeconds: 1
    },
    ["viacepAddressProvider" /* VIACEP_ADDRESS */]: {
      points: 1,
      windowSeconds: 1
    },
    ["brasilApiAddressProvider" /* BRASIL_API_ADDRESS */]: {
      points: 5,
      windowSeconds: 1
    },
    ["nominatimGeocodingProvider" /* NOMINATIM_GEOCODING */]: {
      points: 1,
      windowSeconds: 1
    },
    ["locationIqGeocodingProvider" /* LOCATION_IQ_GEOCODING */]: {
      points: 2,
      windowSeconds: 1
    },
    ["stadiaRoutingProvider" /* STADIA_ROUTING */]: {
      points: 50,
      windowSeconds: 1
    }
  };
  constructor(redis) {
    this.redis = redis;
  }
  static getInstance(redis) {
    this.instance ??= new _RedisRateLimiter(redis);
    return this.instance;
  }
  /**
   * Retorna ou cria um RateLimiter para o provider.
   * ❗ Provider PRECISA existir em providerConfigs.
   */
  getLimiter(provider) {
    const config = safeLookup(this.providerConfigs, provider) ?? DEFAULT_PROVIDER_LIMIT;
    const existingLimiter = this.limiters.get(provider);
    if (existingLimiter) {
      return existingLimiter;
    }
    const limiter = new import_rate_limiter_flexible.RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: `${REDIS_CONSTANTS.KEYS.RATE_LIMIT_PREFIX}${provider}`,
      points: config.points,
      duration: config.windowSeconds,
      execEvenly: false,
      blockDuration: 0
    });
    this.limiters.set(provider, limiter);
    if (this.limiters.size > LIMITER_COUNT_WARN_THRESHOLD) {
      logger.warn(
        { size: this.limiters.size },
        "ALERTA: Muitos RateLimiters instanciados. Verifique se providers est\xE3o est\xE1ticos."
      );
    }
    return limiter;
  }
  /**
   * Consome 1 ponto do Rate Limit do provider.
   * Bucket GLOBAL compartilhado por todas as instâncias.
   */
  async tryConsume(provider) {
    const CONSUMER_KEY = "global";
    try {
      const limiter = this.getLimiter(provider);
      await limiter.consume(CONSUMER_KEY, 1);
      collectMetricsRateLimiterConsumed?.inc({ provider });
      _RedisRateLimiter.outage.succeeded({ provider });
      return true;
    } catch (error) {
      if (isRateLimitRejection(error)) {
        collectMetricsRateLimiterRejected?.inc({ provider });
        return false;
      }
      _RedisRateLimiter.outage.failed({ provider }, asLoggableError(error));
      return true;
    }
  }
  static destroyInstance() {
    this.outage.reset();
    if (!this.instance) {
      logger.debug(RATE_LIMITER_LOGS.NO_INSTANCE_TO_DESTROY);
      return;
    }
    this.instance.destroyRateLimiterMap();
    this.instance = null;
  }
  destroyRateLimiterMap() {
    for (const [provider] of this.limiters.entries()) {
      logger.debug({ provider }, "Limpando RateLimiter do provider.");
    }
    this.limiters.clear();
  }
};

// src/providers/helpers/precision-helper.ts
var PrecisionHelper = class {
  /**
   * Estratégia para provedores baseados em OpenStreetMap (Nominatim, LocationIQ)
   */
  static fromOsm(data) {
    const rank = Number(data.place_rank) || 0;
    if (rank >= ROOFTOP_MIN_RANK || isRooftopPlace(data)) {
      return "ROOFTOP" /* ROOFTOP */;
    }
    if (rank >= NEIGHBORHOOD_MIN_RANK || isNeighborhoodPlace(data)) {
      return "NEIGHBORHOOD" /* NEIGHBORHOOD */;
    }
    return "CITY" /* CITY */;
  }
  /**
   * Estratégia para provedores de CEP (AwesomeAPI, ViaCEP)
   * Baseada na presença de campos.
   */
  static fromAddressData(data) {
    if (data.logradouro && data.logradouro.trim() !== "") {
      return "ROOFTOP" /* ROOFTOP */;
    }
    if (data.bairro && data.bairro.trim() !== "") {
      return "NEIGHBORHOOD" /* NEIGHBORHOOD */;
    }
    return "CITY" /* CITY */;
  }
};
var ROOFTOP_MIN_RANK = 26;
var NEIGHBORHOOD_MIN_RANK = 16;
var ROOFTOP_TYPES = /* @__PURE__ */ new Set(["house", "building", "residential", "apartments", "commercial"]);
var ROOFTOP_CATEGORIES = /* @__PURE__ */ new Set(["highway", "secondary", "primary", "road"]);
var NEIGHBORHOOD_TYPES = /* @__PURE__ */ new Set(["neighbourhood", "suburb", "quarter", "hamlet", "district"]);
function isRooftopPlace(data) {
  return ROOFTOP_TYPES.has(data.type || "") || ROOFTOP_CATEGORIES.has(data.class || "");
}
function isNeighborhoodPlace(data) {
  return NEIGHBORHOOD_TYPES.has(data.type || "") || data.addresstype === "suburb";
}

// src/messages/constants/providers/awesome-api.ts
var AWESOME_API_CONFIG = {
  TIMEOUT_MS: 2e3,
  MAX_RETRIES: 2,
  BACKOFF_MS: 100,
  HTTPS_AGENT: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT
};

// src/providers/address-provider/awesome-api-provider.ts
var AwesomeApiProvider = class {
  constructor(config) {
    this.config = config;
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: AWESOME_API_CONFIG.TIMEOUT_MS
    });
  }
  config;
  api;
  providerName = "AwesomeAPI";
  rateLimitConfig = "awesomeApiAddressProvider" /* AWESOME_API_ADDRESS */;
  maxRetries = AWESOME_API_CONFIG.MAX_RETRIES;
  backoffMs = AWESOME_API_CONFIG.BACKOFF_MS;
  timeoutMs = AWESOME_API_CONFIG.TIMEOUT_MS;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await this.api.get(`/${cleanCep}`, {
      signal
    });
    if (!data?.cep) {
      return null;
    }
    const normalizedData = {
      logradouro: data.address_name,
      bairro: data.district,
      localidade: data.city,
      uf: data.state
    };
    const precision = PrecisionHelper.fromAddressData(normalizedData);
    return {
      logradouro: data.address_name,
      bairro: data.district,
      localidade: data.city,
      uf: data.state,
      lat: Number.parseFloat(data.lat),
      lon: Number.parseFloat(data.lng),
      providerName: "AwesomeAPI",
      precision
    };
  }
};

// src/messages/constants/providers/brasil-api.ts
var BRASIL_API_CONFIG = {
  TIMEOUT_MS: 2e3,
  MAX_RETRIES: 2,
  BACKOFF_MS: 100,
  HTTPS_AGENT: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT
};

// src/providers/address-provider/brasil-api-provider.ts
var BrasilApiProvider = class {
  constructor(config) {
    this.config = config;
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: BRASIL_API_CONFIG.TIMEOUT_MS
    });
  }
  config;
  api;
  providerName = "BrasilAPI";
  rateLimitConfig = "brasilApiAddressProvider" /* BRASIL_API_ADDRESS */;
  maxRetries = BRASIL_API_CONFIG.MAX_RETRIES;
  backoffMs = BRASIL_API_CONFIG.BACKOFF_MS;
  timeoutMs = BRASIL_API_CONFIG.TIMEOUT_MS;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await this.api.get(`/${cleanCep}`, {
      signal
    });
    if (!data?.cep || !data.city || !data.state) {
      return null;
    }
    const normalizedData = {
      logradouro: data.street,
      bairro: data.neighborhood,
      localidade: data.city,
      uf: data.state
    };
    const precision = PrecisionHelper.fromAddressData(normalizedData);
    return {
      ...normalizedData,
      precision,
      providerName: "BrasilAPI"
    };
  }
};

// src/messages/constants/providers/viacep.ts
var VIACEP_CONFIG = {
  TIMEOUT_MS: 2500,
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  HTTPS_AGENT: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT
};

// src/providers/address-provider/viaCep-provider.ts
var ViaCepProvider = class {
  constructor(config) {
    this.config = config;
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: VIACEP_CONFIG.TIMEOUT_MS
    });
  }
  config;
  api;
  providerName = "ViaCEP";
  rateLimitConfig = "viacepAddressProvider" /* VIACEP_ADDRESS */;
  maxRetries = VIACEP_CONFIG.MAX_RETRIES;
  backoffMs = VIACEP_CONFIG.BACKOFF_MS;
  timeoutMs = VIACEP_CONFIG.TIMEOUT_MS;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await this.api.get(`/${cleanCep}/json`, {
      signal
    });
    if (!data || data.erro) {
      return null;
    }
    const precision = PrecisionHelper.fromAddressData(data);
    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      localidade: data.localidade,
      uf: data.uf,
      providerName: "ViaCEP",
      precision
    };
  }
};

// src/messages/constants/providers/nominatim.ts
var NOMINATIM_CONFIG = {
  TIMEOUT_MS: 3e3,
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  HTTPS_AGENT: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT,
  API_PARAMS: {
    FORMAT: "json",
    SEARCH_LIMIT: 1
  }
};

// src/providers/geo-provider/nominatim-provider.ts
var NominatimGeoProvider = class {
  constructor(config) {
    this.config = config;
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: NOMINATIM_CONFIG.TIMEOUT_MS,
      userAgent: SHARED_PROVIDER_DEFAULTS.USER_AGENT_WITH_CONTACT
    });
  }
  config;
  api;
  providerName = "Nominatim";
  rateLimitConfig = "nominatimGeocodingProvider" /* NOMINATIM_GEOCODING */;
  maxRetries = NOMINATIM_CONFIG.MAX_RETRIES;
  backoffMs = NOMINATIM_CONFIG.BACKOFF_MS;
  timeoutMs = NOMINATIM_CONFIG.TIMEOUT_MS;
  async searchRaw(query, signal) {
    return this.performRequest(
      { q: query, limit: NOMINATIM_CONFIG.API_PARAMS.SEARCH_LIMIT, format: NOMINATIM_CONFIG.API_PARAMS.FORMAT },
      signal
    );
  }
  async searchStructuredRaw(options, signal) {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: NOMINATIM_CONFIG.API_PARAMS.SEARCH_LIMIT,
        format: NOMINATIM_CONFIG.API_PARAMS.FORMAT
      },
      signal
    );
  }
  async performRequest(params, signal) {
    const cleanParams = this.cleanParams(params);
    const response = await this.api.get("/search", {
      params: cleanParams,
      signal
    });
    const bestMatch = response.data?.[0];
    if (!bestMatch) {
      return null;
    }
    return {
      lat: Number.parseFloat(bestMatch.lat),
      lon: Number.parseFloat(bestMatch.lon),
      precision: PrecisionHelper.fromOsm(bestMatch),
      providerName: "Nominatim"
    };
  }
  cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
};

// src/messages/constants/providers/location-iq.ts
var LOCATION_IQ_CONFIG = {
  TIMEOUT_MS: 2500,
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  HTTPS_AGENT: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT,
  API_PARAMS: {
    FORMAT: "json",
    SEARCH_LIMIT: 1,
    ADDRESS_DETAILS: 1
  }
};

// src/providers/geo-provider/location-iq-provider.ts
var LocationIqProvider = class {
  constructor(config) {
    this.config = config;
    this.api = createProviderHttpClient({
      baseURL: this.config.apiUrl,
      timeoutMs: LOCATION_IQ_CONFIG.TIMEOUT_MS,
      extra: {
        params: {
          key: this.config.apiToken,
          format: LOCATION_IQ_CONFIG.API_PARAMS.FORMAT
        }
      }
    });
  }
  config;
  api;
  providerName = "LocationIQ";
  rateLimitConfig = "locationIqGeocodingProvider" /* LOCATION_IQ_GEOCODING */;
  maxRetries = LOCATION_IQ_CONFIG.MAX_RETRIES;
  backoffMs = LOCATION_IQ_CONFIG.BACKOFF_MS;
  timeoutMs = LOCATION_IQ_CONFIG.TIMEOUT_MS;
  async searchRaw(query, signal) {
    return this.performRequest(
      {
        q: query,
        limit: LOCATION_IQ_CONFIG.API_PARAMS.SEARCH_LIMIT,
        addressdetails: LOCATION_IQ_CONFIG.API_PARAMS.ADDRESS_DETAILS
      },
      signal
    );
  }
  async searchStructuredRaw(options, signal) {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: LOCATION_IQ_CONFIG.API_PARAMS.SEARCH_LIMIT,
        addressdetails: LOCATION_IQ_CONFIG.API_PARAMS.ADDRESS_DETAILS
      },
      signal
    );
  }
  async performRequest(params, signal) {
    const response = await this.api.get("/search", {
      params,
      signal
    });
    if (!response.data || response.data.length === 0) {
      return null;
    }
    const bestMatch = response.data[0];
    return {
      lat: Number.parseFloat(bestMatch.lat),
      lon: Number.parseFloat(bestMatch.lon),
      precision: PrecisionHelper.fromOsm(bestMatch),
      providerName: "LocationIQ"
    };
  }
};

// src/providers/geo-provider/error/no-geo-provider-error.ts
var NoGeoProviderError = class extends InfrastructureError {
  constructor() {
    super(GEO_ERRORS.NO_PROVIDER);
  }
};

// src/providers/geo-provider/resilient-geo-provider.ts
var perProviderEvents2 = {
  success(providerName) {
    logger.info({ provider: providerName }, "Geocodifica\xE7\xE3o obtida com sucesso por um provedor de geocodifica\xE7\xE3o");
  },
  emptyResult(providerName) {
    logger.info({ provider: providerName }, "Provedor retornou null (n\xE3o encontrado) - tentando pr\xF3ximo");
  },
  notFound(providerName) {
    logger.info({ provider: providerName }, "Coordenadas n\xE3o encontradas - tentando pr\xF3ximo");
  },
  retryable(providerName, attempt, error) {
    logger.warn(
      { provider: providerName, attempt, error },
      "Provedor de geocodifica\xE7\xE3o retornou erro recuper\xE1vel. Alternando para o pr\xF3ximo provedor..."
    );
  },
  fatal(providerName, error) {
    logger.error({ provider: providerName, error }, "Provedor retornou erro fatal. Abortando cadeia.");
  }
};
var chainOutcomeEvents2 = {
  allNotFound(notFoundCount, totalProviders) {
    logger.warn({ notFoundCount, totalProviders }, "Nenhum provedor retornou resultados - coordenadas n\xE3o encontradas");
  },
  systemFailure(providerName, _notFoundCount, error) {
    logger.error({ provider: providerName, error }, "Geocodifica\xE7\xE3o falhou com erros de sistema");
  }
};
var geoNarrator = { ...perProviderEvents2, ...chainOutcomeEvents2 };
var ResilientGeoProvider = class {
  constructor(providers) {
    this.providers = providers;
    if (this.providers.length === 0) {
      throw new NoGeoProviderError();
    }
  }
  providers;
  async search(query, deadline = Deadline.none()) {
    return await this.executeStrategy(async (provider, inner) => await provider.search(query, inner), deadline);
  }
  async searchStructured(options, deadline = Deadline.none()) {
    return await this.executeStrategy(
      async (provider, inner) => await provider.searchStructured(options, inner),
      deadline
    );
  }
  async executeStrategy(attempt, deadline) {
    return await runProviderChain({
      providers: this.providers,
      layer: "geocoding",
      narrator: geoNarrator,
      allNotFoundError: () => new CoordinatesNotFoundError(),
      deadline,
      attempt
    });
  }
};

// src/messages/constants/providers/stadia.ts
var STADIA_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3e3,
  // Two attempts, matching the address and geocoding providers. Recovers a
  // transient blip without softening the recorded "routing fails hard" decision:
  // there is still no second routing provider to fall back to.
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  AUTH_PREFIX: "Stadia-Auth",
  UNITS: "kilometers",
  CONTENT_TYPE: "application/json"
};

// src/core/constants/upstream-http-status.ts
var UPSTREAM_STATUS = {
  /** The provider is throttling us — retryable, and a reason to fall through. */
  TOO_MANY_REQUESTS: 429,
  /** The provider answered authoritatively that the resource does not exist. */
  NOT_FOUND: 404
};
var UPSTREAM_SUCCESS_MIN = 200;
var UPSTREAM_SUCCESS_MAX_EXCLUSIVE = 300;

// src/providers/church-routing-provider/stadia-church-routing-provider.ts
function isEmptyMatrix(status, data) {
  return status === UPSTREAM_STATUS.NOT_FOUND || !data?.sources_to_targets.length;
}
function readMatrixRow(row, destinationCount) {
  return Array.from({ length: destinationCount }, (_, index) => {
    const entry = row?.[index];
    if (entry?.distance == null) {
      return { distance: null, status: 0 };
    }
    return { distance: entry.distance, status: 0 };
  });
}
var StadiaChurchRoutingProvider = class {
  constructor(config) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? STADIA_CONFIG.DEFAULT_TIMEOUT_MS;
    this.defaultCosting = config.defaultCosting;
    this.api = createHttpClient({
      timeout: this.timeoutMs
    });
  }
  config;
  api;
  providerName = "Stadia Maps";
  rateLimitConfig = "stadiaRoutingProvider" /* STADIA_ROUTING */;
  timeoutMs;
  maxRetries = STADIA_CONFIG.MAX_RETRIES;
  backoffMs = STADIA_CONFIG.BACKOFF_MS;
  defaultCosting;
  resolveCosting(profile) {
    return profile ?? this.config.defaultCosting ?? "auto" /* AUTO */;
  }
  /**
   * The HTTP call itself, kept apart from the interpretation of its answer.
   *
   * The generic carries `| undefined` because that is the truth: axios types
   * `response.data` as the generic regardless of what the server sent, so a
   * 204, an empty body or a proxy error page all arrive typed as a valid
   * payload. Saying so is what makes the guard in the caller necessary instead
   * of "unnecessary".
   */
  async postMatrix(origin, destinations, profile, signal) {
    return await this.api.post(
      this.config.matrixApiUrl.replace(/\/$/, ""),
      {
        sources: [{ lat: origin.lat, lon: origin.lon }],
        targets: destinations.map((d) => ({ lat: d.lat, lon: d.lon })),
        costing: this.resolveCosting(profile),
        units: STADIA_CONFIG.UNITS
      },
      {
        headers: {
          Authorization: `${STADIA_CONFIG.AUTH_PREFIX} ${this.config.apiToken}`,
          "Content-Type": STADIA_CONFIG.CONTENT_TYPE
        },
        // A 404 is a real answer here ("nothing reachable"), not a transport
        // failure, so axios must not throw on it.
        validateStatus: (status) => status >= UPSTREAM_SUCCESS_MIN && status < UPSTREAM_SUCCESS_MAX_EXCLUSIVE || status === UPSTREAM_STATUS.NOT_FOUND,
        signal
      }
    );
  }
  async fetchRawDistances(origin, destinations, profile, signal) {
    const response = await this.postMatrix(origin, destinations, profile, signal);
    const matrix = response.data;
    if (!matrix || isEmptyMatrix(response.status, matrix)) {
      return destinations.map(() => ({ distance: null, status: UPSTREAM_STATUS.NOT_FOUND }));
    }
    return readMatrixRow(matrix.sources_to_targets[0], destinations.length);
  }
};

// src/errors/mappings/find-nearest-churches-error-mapper.ts
var import_axios4 = require("axios");
var import_client6 = require("@prisma/client");

// src/errors/infrastructure/service-busy-error.ts
var ServiceBusyError = class extends InfrastructureError {
  provider;
  constructor(provider) {
    super(
      INFRA_ERRORS.SERVICE_BUSY,
      void 0,
      "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */,
      "RETRYABLE" /* RETRYABLE */,
      "rate_limited" /* RATE_LIMITED */
    );
    this.name = "ServiceBusyError";
    this.provider = provider;
  }
};

// src/errors/infrastructure/timeout-exceeded-error.ts
var TimeoutExceededError = class extends InfrastructureError {
  constructor(reason) {
    super(
      GEO_ERRORS.TIMEOUT_EXCEEDED,
      reason,
      "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
      "RETRYABLE" /* RETRYABLE */,
      "timeout" /* TIMEOUT */
    );
    this.name = "TimeoutExceededError";
  }
};

// src/errors/mappings/find-nearest-churches-error-mapper.ts
var import_cockatiel2 = require("cockatiel");
var PROVIDER_BY_URL_FRAGMENT = [
  ["viacep", "ViaCEP"],
  ["awesomeapi", "AwesomeAPI"],
  ["brasilapi", "BrasilAPI"],
  ["nominatim", "Nominatim"],
  ["locationiq", "LocationIQ"],
  ["stadia", "Stadia Maps"]
];
var ADDRESS_URL_FRAGMENTS = ["viacep", "awesomeapi", "brasilapi"];
var TIMEOUT_CODES = /* @__PURE__ */ new Set(["ERR_CANCELED", "ECONNABORTED"]);
var FindNearestChurchesErrorMapper = class _FindNearestChurchesErrorMapper {
  static PROVIDER_UNKNOWN = "Unknown Provider";
  static async runCatching(fn) {
    try {
      return await fn();
    } catch (error) {
      return err(_FindNearestChurchesErrorMapper.map(error));
    }
  }
  static map(error) {
    if (error instanceof AppError) {
      return error;
    }
    if (_FindNearestChurchesErrorMapper.isAxiosError(error)) {
      return _FindNearestChurchesErrorMapper.mapAxiosError(error);
    }
    if (error instanceof import_client6.Prisma.PrismaClientKnownRequestError || error instanceof import_client6.Prisma.PrismaClientUnknownRequestError) {
      return new DatabaseQueryError(error);
    }
    return _FindNearestChurchesErrorMapper.mapUnrecognized(error);
  }
  /**
   * Failures raised by a resilience policy itself rather than by the provider.
   *
   * These say the call never happened: a breaker had already tripped, or the
   * concurrency limit was full. Left to the fallback below they would be
   * reported as ProviderFailureError, which would both mislabel them in
   * metrics and hide the fact that no upstream request was ever made.
   */
  static mapUnrecognized(error) {
    if (error instanceof import_cockatiel2.BrokenCircuitError) {
      return new CircuitOpenError(_FindNearestChurchesErrorMapper.PROVIDER_UNKNOWN, error);
    }
    if (error instanceof import_cockatiel2.BulkheadRejectedError) {
      return new ServiceOverloadError();
    }
    return new ProviderFailureError(error);
  }
  static mapAxiosError(error) {
    const status = error.response?.status;
    if (status === UPSTREAM_STATUS.TOO_MANY_REQUESTS) {
      return new ServiceBusyError(_FindNearestChurchesErrorMapper.detectProvider(error));
    }
    if (_FindNearestChurchesErrorMapper.isTimeout(error)) {
      return new TimeoutExceededError(error.message);
    }
    if (status === UPSTREAM_STATUS.NOT_FOUND) {
      return _FindNearestChurchesErrorMapper.mapNotFound(error);
    }
    return new ProviderFailureError(error);
  }
  /**
   * A 404 from an address provider means the CEP itself does not exist; from a
   * geocoder it means the address could not be placed on the map.
   */
  static mapNotFound(error) {
    const url = error.config?.url || "";
    if (ADDRESS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return new InvalidCepError(_FindNearestChurchesErrorMapper.extractCep(url));
    }
    return new CoordinatesNotFoundError();
  }
  static isAxiosError(error) {
    return (0, import_axios4.isAxiosError)(error);
  }
  static isTimeout(error) {
    return TIMEOUT_CODES.has(error.code ?? "") || error.message.toLowerCase().includes("timeout");
  }
  static detectProvider(error) {
    const url = error.config?.url || "";
    const match = PROVIDER_BY_URL_FRAGMENT.find(([fragment]) => url.includes(fragment));
    return match ? match[1] : _FindNearestChurchesErrorMapper.PROVIDER_UNKNOWN;
  }
  static extractCep(url) {
    const match = /\b\d{8}\b/.exec(url) || /\d{8}/.exec(url);
    return match ? match[0] : void 0;
  }
};

// src/providers/helpers/deadline-retry.ts
var import_cockatiel4 = require("cockatiel");

// src/providers/helpers/provider-circuit-breaker.ts
var import_cockatiel3 = require("cockatiel");

// src/providers/helpers/retryable-failure.ts
function isRetryableFailure(error) {
  return error instanceof AppError && error.failureMode === "RETRYABLE" /* RETRYABLE */;
}

// src/providers/helpers/provider-circuit-breaker.ts
var breakers = /* @__PURE__ */ new Map();
function getProviderCircuitBreaker(providerName) {
  if (!env.CIRCUIT_BREAKER_ENABLED) {
    return void 0;
  }
  const existing = breakers.get(providerName);
  if (existing) {
    return existing;
  }
  const created = createBreaker();
  breakers.set(providerName, created);
  return created;
}
function createBreaker() {
  return (0, import_cockatiel3.circuitBreaker)((0, import_cockatiel3.handleWhen)(isRetryableFailure), {
    halfOpenAfter: env.CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
    breaker: new import_cockatiel3.SamplingBreaker({
      threshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      duration: env.CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
      minimumRps: env.CIRCUIT_BREAKER_MIN_THROUGHPUT
    })
  });
}

// src/providers/helpers/deadline-retry.ts
var MIN_ATTEMPT_BUDGET_MS = 50;
async function runWithRetries(params) {
  const maxAttempts = Math.max(1, params.maxAttempts);
  const counter = { attempts: 0 };
  const attemptsPolicy = (0, import_cockatiel4.retry)((0, import_cockatiel4.handleWhen)(isRetryableFailure), {
    maxAttempts: maxAttempts - 1,
    backoff: budgetedBackoff(params, maxAttempts)
  }).dangerouslyUnref();
  const breaker = getProviderCircuitBreaker(params.providerName);
  const policy = breaker ? (0, import_cockatiel4.wrap)(attemptsPolicy, breaker) : attemptsPolicy;
  try {
    const attempts = policy.execute(() => attemptOnce(params, counter), params.deadline.signal);
    return ok(await settleFirst(attempts, params.deadline));
  } catch (error) {
    return err(finalize(error, params, counter));
  }
}
function settleFirst(work, deadline) {
  return abortRace(work, deadline.signal, () => {
    throw deadline.asError();
  });
}
async function attemptOnce(params, counter) {
  if (!hasBudgetForAttempt(params.deadline)) {
    throw params.deadline.asError();
  }
  counter.attempts += 1;
  const attemptDeadline = params.deadline.derive(params.attemptTimeoutMs);
  try {
    return await params.action(attemptDeadline);
  } catch (error) {
    throw classifyFailure(error, params.deadline);
  } finally {
    attemptDeadline.dispose();
  }
}
function budgetedBackoff(params, maxAttempts) {
  const options = {
    generator: import_cockatiel4.decorrelatedJitterGenerator,
    initialDelay: params.backoffMs,
    exponent: 2,
    maxDelay: params.backoffMs * 2 ** Math.max(0, maxAttempts - 1)
  };
  return new import_cockatiel4.DelegateBackoff((context, state) => {
    const [raw, nextState] = (0, import_cockatiel4.decorrelatedJitterGenerator)(state, options);
    const delay = Math.max(0, Math.min(raw, params.deadline.remainingMs()));
    logRetry(params, context.attempt, delay);
    return { delay, state: nextState };
  });
}
function classifyFailure(error, deadline) {
  if (deadline.expired) {
    return deadline.asError();
  }
  return FindNearestChurchesErrorMapper.map(error);
}
function hasBudgetForAttempt(deadline) {
  return !deadline.expired && deadline.remainingMs() >= MIN_ATTEMPT_BUDGET_MS;
}
function finalize(error, params, counter) {
  const appError = toAppError(error, params.providerName);
  if (counter.attempts > 0) {
    logExhausted(params, counter.attempts, appError);
  }
  return appError;
}
function toAppError(error, providerName) {
  if (error instanceof import_cockatiel4.BrokenCircuitError) {
    return new CircuitOpenError(providerName, error);
  }
  return error instanceof AppError ? error : FindNearestChurchesErrorMapper.map(error);
}
function logRetry(params, attempt, delay) {
  logger.warn({ ...params.logContext, attempt, delay }, `Repetindo solicita\xE7\xE3o para ${params.providerName}`);
}
function logExhausted(params, attempt, error) {
  logger.error({ ...params.logContext, attempt, error }, `Falha ao consultar ${params.providerName} ap\xF3s tentativas`);
}

// src/providers/helpers/provider-admission.ts
async function checkAdmission(params) {
  const { deadline, providerName, rateLimitConfig, redis } = params;
  if (deadline.expired) {
    return err(deadline.asError());
  }
  const allowed = await RedisRateLimiter.getInstance(redis).tryConsume(rateLimitConfig);
  if (!allowed) {
    return err(new ServiceBusyError(providerName));
  }
  return ok(void 0);
}

// src/providers/helpers/guarded-attempt.ts
async function runGuardedAttempt(params) {
  const { rawProvider, redis, deadline, metricsLayer } = params;
  const admission = await checkAdmission({
    providerName: rawProvider.providerName,
    rateLimitConfig: rawProvider.rateLimitConfig,
    deadline,
    redis
  });
  if (isErr(admission)) {
    if (metricsLayer) {
      recordProviderRequest(metricsLayer, rawProvider.providerName, admission);
    }
    return admission;
  }
  return await attemptWithRetries(params);
}
async function attemptWithRetries(params) {
  const { rawProvider, deadline, action, logContext, metricsLayer } = params;
  const endTimer = metricsLayer ? collectMetricsProviderLatency?.startTimer({ provider: rawProvider.providerName, layer: metricsLayer }) : void 0;
  const outcome = await runWithRetries({
    providerName: rawProvider.providerName,
    maxAttempts: rawProvider.maxRetries,
    backoffMs: rawProvider.backoffMs,
    attemptTimeoutMs: rawProvider.timeoutMs,
    deadline,
    logContext,
    action
  });
  endTimer?.();
  if (metricsLayer) {
    recordProviderRequest(metricsLayer, rawProvider.providerName, outcome);
  }
  return outcome;
}

// src/providers/address-provider/decorators/resilient-address-provider.decorator.ts
var ResilientAddressProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
  }
  rawProvider;
  redisRateLimiterConnection;
  providerName;
  async fetchAddress(cep, deadline = Deadline.none()) {
    const cleanCep = cep.replace(/\D/g, "");
    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      logContext: { cep: cleanCep },
      action: async (attempt) => await this.rawProvider.fetchRawAddress(cleanCep, attempt.signal),
      deadline
    });
  }
};

// src/providers/geo-provider/decorators/resilient-geocoding-provider.decorator.ts
var ResilientGeocodingProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
  }
  rawProvider;
  redisRateLimiterConnection;
  providerName;
  async search(query, deadline = Deadline.none()) {
    return await this.executeResiliently(
      async (attempt) => await this.rawProvider.searchRaw(query, attempt.signal),
      { query },
      deadline
    );
  }
  async searchStructured(options, deadline = Deadline.none()) {
    return await this.executeResiliently(
      async (attempt) => await this.rawProvider.searchStructuredRaw(options, attempt.signal),
      { options },
      deadline
    );
  }
  // No `metricsLayer`: ResilientGeoProvider records them while walking the chain.
  async executeResiliently(action, logContext, deadline) {
    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      deadline,
      logContext,
      action
    });
  }
};

// src/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator.ts
var ResilientChurchRoutingProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
  }
  rawProvider;
  redisRateLimiterConnection;
  providerName;
  /**
   * Unlike the address and geocoding layers there is no chain above this one —
   * routing has a single provider by design — so this decorator asks
   * {@link runGuardedAttempt} to record its own provider metrics.
   */
  async getDistances(params) {
    const deadline = params.deadline ?? Deadline.none();
    const costing = params.profile ?? this.rawProvider.defaultCosting ?? "auto" /* AUTO */;
    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      metricsLayer: "routing",
      action: async (attempt) => await this.rawProvider.fetchRawDistances(params.origin, params.destinations, costing, attempt.signal),
      deadline
    });
  }
};

// src/errors/app-error-registry.ts
var UNKNOWN_PROVIDER = "Unknown Provider";
function readProvider(data) {
  return data?.provider || data?.body?.provider;
}
var AppErrorRegistry = {
  InvalidCepError: (msg) => {
    const cep = /\b\d{8}\b/.exec(msg)?.[0] || /\d{8}/.exec(msg)?.[0];
    return new InvalidCepError(cep);
  },
  CoordinatesNotFoundError: () => new CoordinatesNotFoundError(),
  NoNearbyChurchesFoundError: () => new NoNearbyChurchesFoundError(),
  EmptyChurchListError: () => new EmptyChurchListError(),
  CepToLatLonError: (msg) => {
    const cep = /\d+/.exec(msg)?.[0] || "";
    return new CepToLatLonError(cep);
  },
  ServiceBusyError: (msg, data) => {
    const provider = readProvider(data) || msg.replace("Servi\xE7o temporariamente indispon\xEDvel: ", "");
    return new ServiceBusyError(provider);
  },
  ServiceOverloadError: () => new ServiceOverloadError(),
  TimeoutExceededError: (msg) => new TimeoutExceededError(msg),
  DeadlineExceededError: (msg) => new DeadlineExceededError(msg),
  CircuitOpenError: (_msg, data) => {
    return new CircuitOpenError(readProvider(data) || UNKNOWN_PROVIDER);
  },
  ProviderFailureError: (_msg, data) => new ProviderFailureError(data?.originalError)
};
function serializeAppError(err2) {
  return {
    type: err2.constructor.name,
    message: err2.message,
    data: err2.data || err2
  };
}
var UnknownDeserializationError = class extends InfrastructureError {
  constructor(message) {
    super({
      code: "UNKNOWN_DESERIALIZATION_ERROR",
      message
    });
  }
};
function deserializeAppError(type, message, data) {
  const factory = safeLookup(AppErrorRegistry, type);
  if (factory) {
    try {
      return factory(message, data);
    } catch {
    }
  }
  return new UnknownDeserializationError(message);
}

// src/use-cases/churches/church-lookup-cache-policy.ts
function isRetryableChurchLookupError(error) {
  return error.failureMode !== "NOT_FOUND" /* NOT_FOUND */ && error.failureMode !== "PERMANENT" /* PERMANENT */;
}
function negativeTtlForChurchLookup(error) {
  return error.failureMode === "NOT_FOUND" /* NOT_FOUND */ ? CACHE_CONFIG.NEAREST_CHURCHES.NOT_FOUND_TTL_SECONDS : CACHE_CONFIG.NEAREST_CHURCHES.PERMANENT_TTL_SECONDS;
}
function makeNearestChurchesCacheOptions(circuitBreaker3) {
  return {
    // Passed in rather than read here: this module stays free of env so it can
    // be exercised without dragging the provider graph into a unit test.
    circuitBreaker: circuitBreaker3,
    prefix: CACHE_CONFIG.NEAREST_CHURCHES.PREFIX,
    defaultTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.DEFAULT_TTL_SECONDS,
    negativeTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.NEGATIVE_TTL_SECONDS,
    maxPendingFetches: CACHE_CONFIG.NEAREST_CHURCHES.MAX_PENDING_FETCHES,
    fetchTimeoutMs: CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS,
    serializeError: serializeAppError,
    deserializeError: deserializeAppError,
    isRetryable: isRetryableChurchLookupError,
    negativeTtlFor: negativeTtlForChurchLookup
  };
}

// src/use-cases/factories/make-find-nearest-churches-use-case.ts
var cachedUseCase = null;
function makeResilientGeoProvider(redisRateLimitConnection) {
  const rawNominatimProvider = new NominatimGeoProvider({
    apiUrl: env.NOMINATIM_API_URL
  });
  const rawLocationIqProvider = new LocationIqProvider({
    apiUrl: env.LOCATION_IQ_API_URL,
    apiToken: env.LOCATION_IQ_API_TOKEN
  });
  const nominatimProvider = new ResilientGeocodingProviderDecorator(rawNominatimProvider, redisRateLimitConnection);
  const locationIqProvider = new ResilientGeocodingProviderDecorator(rawLocationIqProvider, redisRateLimitConnection);
  return new ResilientGeoProvider([locationIqProvider, nominatimProvider]);
}
function makeResilientAddressProvider(redisRateLimitConnection) {
  const rawAwesomeApiProvider = new AwesomeApiProvider({
    apiUrl: env.AWESOME_API_URL,
    apiToken: env.AWESOME_API_TOKEN
  });
  const rawBrasilApiProvider = new BrasilApiProvider({
    apiUrl: env.BRASIL_API_URL
  });
  const rawViaCepProvider = new ViaCepProvider({
    apiUrl: env.VIACEP_API_URL
  });
  const awesomeApiProvider = new ResilientAddressProviderDecorator(rawAwesomeApiProvider, redisRateLimitConnection);
  const brasilApiProvider = new ResilientAddressProviderDecorator(rawBrasilApiProvider, redisRateLimitConnection);
  const viaCepProvider = new ResilientAddressProviderDecorator(rawViaCepProvider, redisRateLimitConnection);
  return new ResilientAddressProvider([awesomeApiProvider, brasilApiProvider, viaCepProvider]);
}
function makeCalculateChurchRouteDistancesUseCase(redisRateLimitConnection) {
  const rawRoutingProvider = new StadiaChurchRoutingProvider({
    matrixApiUrl: env.STADIA_MAPS_MATRIX_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: "pedestrian" /* PEDESTRIAN */,
    timeoutMs: STADIA_CONFIG.DEFAULT_TIMEOUT_MS
  });
  const routingProvider = new ResilientChurchRoutingProviderDecorator(rawRoutingProvider, redisRateLimitConnection);
  return new CalculateChurchRouteDistancesUseCase(routingProvider);
}
function cacheCircuitBreakerSettings() {
  if (!env.CIRCUIT_BREAKER_ENABLED) {
    return void 0;
  }
  return {
    failureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    samplingWindowMs: env.CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
    minimumThroughput: env.CIRCUIT_BREAKER_MIN_THROUGHPUT,
    halfOpenAfterMs: env.CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS
  };
}
function makeFindNearestChurchesUseCase(redisCacheConnection = getRedisCache(), redisRateLimitConnection = getRedisRateLimit()) {
  if (cachedUseCase) {
    return cachedUseCase;
  }
  const cepToLatLonUseCase = new CepToLatLonUseCase(
    makeResilientGeoProvider(redisRateLimitConnection),
    makeResilientAddressProvider(redisRateLimitConnection)
  );
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository);
  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    makeCalculateChurchRouteDistancesUseCase(redisRateLimitConnection),
    {
      redis: redisCacheConnection,
      options: makeNearestChurchesCacheOptions(cacheCircuitBreakerSettings()),
      defaultProfile: "pedestrian" /* PEDESTRIAN */
    }
  );
  return cachedUseCase;
}

// src/http/controllers/churches/find-nearest-churches.controller.ts
async function findNearestChurches(request, reply) {
  const { cep } = request.query;
  logger.info({
    msg: "Cep do usu\xE1rio recebido para encontrar igrejas pr\xF3ximas",
    ip: request.ip
  });
  const findNearestChurchesUseCase = makeFindNearestChurchesUseCase();
  const result = await findNearestChurchesUseCase.execute({ cep, deadline: request.deadline });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const response = result.value;
  logger.info({
    msg: "Igrejas mais pr\xF3ximas encontradas com sucesso",
    nearestChurchesInfo: response.nearestChurchesInfo
  });
  return reply.code(HTTP_STATUS.OK).send(response);
}

// src/http/presenters/church-presenter.ts
var ChurchPresenter = class {
  static toHTTP(input) {
    if (Array.isArray(input)) {
      return input.map((c) => isNearby(c) ? toHTTPNearby(c) : toHTTPChurch(c));
    }
    return isNearby(input) ? toHTTPNearby(input) : toHTTPChurch(input);
  }
};
function isNearby(input) {
  return "distanceKm" in input && "distanceMeters" in input;
}
var toHTTPNearby = toPublicNearbyChurch;
function toHTTPChurch(input) {
  return {
    publicId: input.publicId,
    name: input.name,
    address: input.address,
    lat: input.lat,
    lon: input.lon,
    geog: input.geog,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

// src/use-cases/errors/no-address-error.ts
var NoAddressError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_ADDRESS_PROVIDED, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/churches/create-church-use-case.ts
var CreateChurchUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  churchesRepository;
  async execute({
    name,
    address,
    lat,
    lon
  }) {
    if (!address || address.trim() === "") {
      return err(new NoAddressError());
    }
    const duplicate = await this.findDuplicate({ name, lat, lon });
    if (duplicate) {
      return duplicate;
    }
    const createResult = await this.churchesRepository.createChurch({
      name,
      address,
      lat,
      lon
    });
    if (isErr(createResult)) {
      return createResult;
    }
    return ok(createResult.value);
  }
  /**
   * A church is a duplicate if the name is taken, or if the name-and-coordinates
   * pair already exists. Both checks answer with the same error, so they are
   * asked in one place.
   */
  async findDuplicate(params) {
    const nameResult = await this.churchesRepository.findByName(params.name);
    if (isErr(nameResult)) {
      return nameResult;
    }
    if (nameResult.value !== null) {
      return err(new ChurchAlreadyExistsError());
    }
    const paramsResult = await this.churchesRepository.findByParams(params);
    if (isErr(paramsResult)) {
      return paramsResult;
    }
    return paramsResult.value === null ? null : err(new ChurchAlreadyExistsError());
  }
};

// src/use-cases/factories/make-create-church-use-case.ts
function makeCreateChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  return new CreateChurchUseCase(churchesRepository);
}

// src/http/controllers/churches/create-church.controller.ts
async function createChurch(request, reply) {
  const { name, address, lat, lon } = request.body;
  logger.info({
    msg: "Criando uma nova igreja"
  });
  const createChurchUseCase = makeCreateChurchUseCase();
  const result = await createChurchUseCase.execute({
    name,
    address,
    lat,
    lon
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const sanitizedChurch = ChurchPresenter.toHTTP(result.value);
  logger.info({
    msg: "Igreja criada com sucesso",
    church: sanitizedChurch
  });
  return reply.code(HTTP_STATUS.CREATED).send({ church: sanitizedChurch });
}

// src/http/controllers/churches/churches.routes.ts
var import_client7 = require("@prisma/client");

// src/use-cases/churches/delete-church-use-case.ts
var DeleteChurchUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  churchesRepository;
  async execute({ publicId }) {
    const result = await this.churchesRepository.deleteChurchByPublicId(publicId);
    if (isErr(result)) {
      return result;
    }
    return ok({ church: result.value });
  }
};

// src/use-cases/factories/make-delete-church-use-case.ts
function makeDeleteChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  return new DeleteChurchUseCase(churchesRepository);
}

// src/http/controllers/churches/delete-church.controller.ts
async function deleteChurch(request, reply) {
  const { publicId } = request.body;
  logger.info({
    msg: "Deletando uma igreja"
  });
  const deleteChurchUseCase = makeDeleteChurchUseCase();
  const result = await deleteChurchUseCase.execute({
    publicId
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const sanitizedChurch = ChurchPresenter.toHTTP(result.value.church);
  logger.info({
    msg: "Igreja deletada com sucesso",
    church: sanitizedChurch
  });
  return reply.code(HTTP_STATUS.OK).send({ church: sanitizedChurch });
}

// src/use-cases/churches/find-church-publicId-by-name-use-case.ts
var FindChurchPublicIdByNameUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  churchesRepository;
  async execute({
    name
  }) {
    const result = await this.churchesRepository.findByName(name);
    if (isErr(result)) {
      return result;
    }
    const church = result.value;
    if (!church) {
      return err(new ChurchNotFoundError());
    }
    const publicId = church.publicId;
    return ok({ publicId });
  }
};

// src/use-cases/factories/make-find-church-publicId-by-name-use-case.ts
function makeFindChurchPublicIdByNameUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  return new FindChurchPublicIdByNameUseCase(churchesRepository);
}

// src/http/controllers/churches/find-church-publicId-by-name.controller.ts
async function findChurchPublicIdByName(request, reply) {
  const { name } = request.body;
  const findChurchPublicIdByNameUseCase = makeFindChurchPublicIdByNameUseCase();
  const result = await findChurchPublicIdByNameUseCase.execute({ name });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.code(HTTP_STATUS.OK).send({ publicId: result.value.publicId });
}

// src/http/policies/deadline.ts
var HTTP_DEADLINE_POLICIES = {
  churches: {
    /**
     * The cold happy path is two sequential external calls (an address provider
     * at ~2s, then the Stadia matrix at ~3s) plus a PostGIS KNN, so 8s clears it
     * with margin. It replaces an effective ceiling of ~17s — the old 15s cache
     * budget plus an unbounded Redis read and write at either end — which is far
     * past any sane client timeout for a synchronous GET.
     *
     * See docs/timeout-and-cancellation-model.md §4 and
     * docs/architecture-assessment-BullMQ-native-jobs-and-routing.md §4.2.
     */
    nearest: 8e3
  }
};

// src/http/schemas/utils/cep.ts
var import_zod15 = require("zod");
var cepSchema = import_zod15.z.string().regex(/^\d{5}-?\d{3}$/, {
  message: VALIDATION_CONSTANTS.CEP.INVALID_FORMAT
});

// src/http/schemas/churches/create-church-schema.ts
var import_zod16 = __toESM(require("zod"));
var createChurchBodySchema = import_zod16.default.object({
  name: import_zod16.default.string().min(VALIDATION_LIMITS.CHURCH_NAME_MIN, `O nome deve ter no m\xEDnimo ${VALIDATION_LIMITS.CHURCH_NAME_MIN} caracteres`).transform((val) => val.toLowerCase()),
  address: import_zod16.default.string().min(
    VALIDATION_LIMITS.CHURCH_ADDRESS_MIN,
    `O endere\xE7o deve ter no m\xEDnimo ${VALIDATION_LIMITS.CHURCH_ADDRESS_MIN} caracteres`
  ).transform((val) => val.toLowerCase()),
  lat: import_zod16.default.coerce.number().min(MIN_LATITUDE, `Latitude deve ser >= ${MIN_LATITUDE}`).max(MAX_LATITUDE, `Latitude deve ser <= ${MAX_LATITUDE}`),
  lon: import_zod16.default.coerce.number().min(MIN_LONGITUDE, `Longitude deve ser >= ${MIN_LONGITUDE}`).max(MAX_LONGITUDE, `Longitude deve ser <= ${MAX_LONGITUDE}`)
});

// src/http/schemas/churches/delete-church-schema.ts
var import_zod17 = __toESM(require("zod"));
var publicIdDeleteChurchSchema = import_zod17.default.uuid();
var deleteChurchBodySchema = import_zod17.default.object({
  publicId: publicIdDeleteChurchSchema
});

// src/http/schemas/churches/find-church-by-name-schema.ts
var import_zod18 = __toESM(require("zod"));
var findChurchByNameSchema = import_zod18.default.object({
  name: import_zod18.default.string().min(
    VALIDATION_LIMITS.CHURCH_NAME_MIN,
    `O nome deve ter no m\xEDnimo ${VALIDATION_LIMITS.CHURCH_NAME_MIN} caracteres`
  )
});

// src/http/controllers/churches/churches.routes.ts
var import_zod19 = __toESM(require("zod"));
async function churchesRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  app2.get(
    "/nearest",
    {
      config: {
        rateLimit: HTTP_RATE_LIMIT_POLICIES.churches.nearest,
        deadlineMs: HTTP_DEADLINE_POLICIES.churches.nearest
      },
      schema: {
        tags: ["Churches"],
        summary: "Encontra as igrejas mais pr\xF3ximas de um CEP",
        querystring: import_zod19.default.object({ cep: cepSchema })
      }
    },
    findNearestChurches
  );
  app2.post(
    "/find-church-publicId-by-name",
    {
      onRequest: [verifyJwt],
      schema: {
        tags: ["Churches"],
        summary: "Encontra o ID p\xFAblico de uma igreja pelo nome",
        body: findChurchByNameSchema
      }
    },
    findChurchPublicIdByName
  );
  app2.post(
    "/create",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client7.UserRole.ADMIN])],
      schema: {
        tags: ["Churches"],
        summary: "Cria uma nova igreja",
        body: createChurchBodySchema
      }
    },
    createChurch
  );
  app2.delete(
    "/delete",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client7.UserRole.ADMIN])],
      schema: {
        tags: ["Churches"],
        summary: "Deleta uma igreja pelo ID p\xFAblico",
        body: deleteChurchBodySchema
      }
    },
    deleteChurch
  );
}

// src/http/controllers/analytics/analytics.routes.ts
var import_client8 = require("@prisma/client");

// src/http/plugins/analytics-identity.plugin.ts
var import_fastify_plugin = __toESM(require("fastify-plugin"));
var import_cookie = require("@fastify/cookie");

// src/http/cookies/options.ts
function isPlainHttpEnv(nodeEnv) {
  return nodeEnv === "development" || nodeEnv === "test";
}
var isPlainHttp = isPlainHttpEnv(env.NODE_ENV);
function hostPrefixed(name, plainHttp = isPlainHttp) {
  return plainHttp ? name : `__Host-${name}`;
}
var VISITOR_COOKIE = hostPrefixed("ed_vid");
var SESSION_COOKIE = hostPrefixed("ed_sid");
var CONSENT_COOKIE = "ed_consent";
var VISITOR_RETENTION_DAYS = 395;
var SESSION_IDLE_MINUTES = 30;
var VISITOR_MAX_AGE = SECONDS_PER_DAY * VISITOR_RETENTION_DAYS;
var SESSION_MAX_AGE = SECONDS_PER_MINUTE * SESSION_IDLE_MINUTES;
var CONSENT_MAX_AGE = SECONDS_PER_DAY * DAYS_PER_YEAR;
var trackingCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: !isPlainHttp,
  sameSite: "lax",
  signed: true
};
var consentCookieOptions = {
  path: "/",
  httpOnly: false,
  secure: !isPlainHttp,
  sameSite: "lax",
  signed: false
};

// src/lib/metrics/analytics-metrics.ts
var import_prom_client6 = require("prom-client");
var registry6 = getRegistry();
var collectMetricsAnalyticsRetentionDeleted = registry6 ? new import_prom_client6.Counter({
  name: "analytics_retention_deleted_total",
  help: "Analytics rows deleted by the retention sweep",
  labelNames: ["table"],
  registers: [registry6]
}) : null;
var collectMetricsAnalyticsRetentionRuns = registry6 ? new import_prom_client6.Counter({
  name: "analytics_retention_runs_total",
  help: "Analytics retention sweep executions",
  registers: [registry6]
}) : null;
var collectMetricsAnalyticsCookieSupersededSecret = registry6 ? new import_prom_client6.Counter({
  name: "analytics_cookie_superseded_secret_total",
  help: "Signed analytics cookies presented that verified against a rotated-out secret",
  labelNames: ["cookie"],
  registers: [registry6]
}) : null;

// src/http/plugins/analytics-identity.plugin.ts
function readSigned(request, name) {
  const raw = request.cookies[name];
  if (!raw) {
    return null;
  }
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) {
    return null;
  }
  if (unsigned.renew) {
    collectMetricsAnalyticsCookieSupersededSecret?.inc({ cookie: name });
  }
  return unsigned.value;
}
var analyticsIdentityPlugin = async (app2) => {
  app2.decorateRequest("visitorId", null);
  app2.decorateRequest("sessionId", null);
  app2.addHook("preHandler", async (request) => {
    request.visitorId = readSigned(request, VISITOR_COOKIE);
    request.sessionId = readSigned(request, SESSION_COOKIE);
  });
};
var analyticsIdentity = (0, import_fastify_plugin.default)(analyticsIdentityPlugin, { name: "analytics-identity" });

// src/http/middlewares/verify-analytics-proxy.middleware.ts
var import_node_crypto4 = require("crypto");

// src/messages/errors/analytics.ts
var ANALYTICS_ERRORS = {
  PROXY_REQUIRED: {
    code: "ANALYTICS_PROXY_REQUIRED",
    message: "N\xE3o autorizado!"
  },
  VISITOR_NOT_FOUND: {
    code: "ANALYTICS_VISITOR_NOT_FOUND",
    message: "Visitante n\xE3o encontrado!"
  }
};

// src/http/middlewares/verify-analytics-proxy.middleware.ts
var ANALYTICS_PROXY_HEADER = "x-analytics-proxy";
function secretsMatch(presented, expected) {
  const presentedDigest = (0, import_node_crypto4.createHash)("sha256").update(presented).digest();
  const expectedDigest = (0, import_node_crypto4.createHash)("sha256").update(expected).digest();
  return (0, import_node_crypto4.timingSafeEqual)(presentedDigest, expectedDigest);
}
async function verifyAnalyticsProxy(request, reply) {
  const presented = request.headers[ANALYTICS_PROXY_HEADER];
  if (typeof presented !== "string" || !secretsMatch(presented, env.ANALYTICS_PROXY_SECRET)) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ message: ANALYTICS_ERRORS.PROXY_REQUIRED.message });
  }
}

// src/core/projections/analytics-session-attributes.ts
var OPTIONAL_SESSION_FIELDS = [
  "userId",
  "ipAddress",
  "browser",
  "os",
  "device",
  "language",
  "referrer",
  "landingPath",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent"
];
function toSessionAttributes(data) {
  const optional = Object.fromEntries(OPTIONAL_SESSION_FIELDS.map((field) => [field, data[field] ?? null]));
  return { visitorId: data.visitorId, ...optional };
}
var FIRST_TOUCH_FIELDS = ["firstUtmSource", "firstUtmMedium", "firstUtmCampaign", "firstLandingPath"];
function toVisitorCreateAttributes(data) {
  const firstTouch = Object.fromEntries(FIRST_TOUCH_FIELDS.map((field) => [field, data[field] ?? null]));
  return { visitorId: data.visitorId, userId: data.userId ?? null, ...firstTouch };
}
function toEventAttributes(data) {
  return {
    title: data.title ?? null,
    referrer: data.referrer ?? null,
    durationMs: data.durationMs ?? null,
    scrollDepth: data.scrollDepth ?? null
  };
}

// src/repositories/prisma/prisma-analytics-repository.ts
var PrismaAnalyticsRepository = class {
  async upsertVisitor(data) {
    try {
      const visitor = await prisma.analyticsVisitor.upsert({
        where: { visitorId: data.visitorId },
        // First-touch attribution is absent from `update` on purpose: it records
        // the campaign that acquired the visitor and must survive later ones.
        // `lastSeenAt` is @updatedAt, so an empty-looking update still moves it.
        //
        // The user link is written ONLY when one is supplied. `userId ?? null`
        // here — the obvious spelling, and what this first did — un-identified
        // the visitor on the next anonymous page view after login, because on a
        // blog almost every request that follows sign-in carries no JWT. That is
        // the opposite of the session rule a few lines down, where absence must
        // clear the value; the two look alike and mean opposite things.
        update: {
          ...data.userId ? { userId: data.userId } : {},
          ...data.countNewSession ? { sessionCount: { increment: 1 } } : {}
        },
        create: toVisitorCreateAttributes(data)
      });
      return ok(visitor);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async upsertSession(data) {
    try {
      const attributes = toSessionAttributes(data);
      const session = await prisma.analyticsSession.upsert({
        where: { sessionId: data.sessionId },
        update: attributes,
        create: { ...attributes, sessionId: data.sessionId }
      });
      return ok(session);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async createEvent(data) {
    try {
      const event = await prisma.analyticsEvent.create({
        data: {
          sessionId: data.sessionId,
          eventType: data.eventType,
          path: data.path,
          ...toEventAttributes(data),
          payload: data.payload ?? null
        }
      });
      return ok(event);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async findSessionBySessionId(sessionId) {
    try {
      return ok(await prisma.analyticsSession.findUnique({ where: { sessionId } }));
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async findVisitorByVisitorId(visitorId) {
    try {
      return ok(await prisma.analyticsVisitor.findUnique({ where: { visitorId } }));
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async linkSessionsToUser(data) {
    try {
      const { count } = await prisma.analyticsSession.updateMany({
        where: sessionsToClaim(data),
        data: { userId: data.userId }
      });
      return ok(count);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async deleteVisitorData(visitorId) {
    try {
      const { count } = await prisma.analyticsVisitor.deleteMany({ where: { visitorId } });
      return ok(count);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async deleteDataForUser(userId) {
    try {
      const { count } = await prisma.analyticsVisitor.deleteMany({ where: { userId } });
      return ok(count);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async purgeEventsOlderThan(cutoff, batchSize) {
    return this.purgeBatch(
      (ids) => prisma.analyticsEvent.deleteMany({ where: { id: { in: ids } } }),
      () => prisma.analyticsEvent.findMany({
        where: { occurredAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize
      })
    );
  }
  async purgeSessionsOlderThan(cutoff, batchSize) {
    return this.purgeBatch(
      (ids) => prisma.analyticsSession.deleteMany({ where: { id: { in: ids } } }),
      () => prisma.analyticsSession.findMany({
        where: { startedAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize
      })
    );
  }
  async purgeVisitorsInactiveSince(cutoff, batchSize) {
    return this.purgeBatch(
      (ids) => prisma.analyticsVisitor.deleteMany({ where: { id: { in: ids } } }),
      () => prisma.analyticsVisitor.findMany({
        where: { lastSeenAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize
      })
    );
  }
  async findPagesRead(query) {
    try {
      const events = await prisma.analyticsEvent.findMany({
        where: {
          session: { visitorId: query.visitorId },
          // A reading measurement, not merely a request. `durationMs` is only
          // written by page_exit, so its presence is what separates "read" from
          // "loaded and abandoned".
          durationMs: { not: null },
          ...query.cursor ? { occurredAt: { lt: query.cursor } } : {}
        },
        orderBy: { occurredAt: "desc" },
        take: query.limit
      });
      return ok(events);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async findVisits(visitorId, limit) {
    try {
      const sessions = await prisma.analyticsSession.findMany({
        where: { visitorId },
        orderBy: { startedAt: "desc" },
        take: limit
      });
      return ok(sessions);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  async findVisitorsByUserId(userId, limit) {
    try {
      const visitors = await prisma.analyticsVisitor.findMany({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        take: limit
      });
      return ok(visitors);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
  /**
   * Select-then-delete rather than a single `deleteMany` with the date filter.
   *
   * `deleteMany` has no LIMIT in Prisma, so on a table with months of backlog it
   * would take one enormous lock and hold it for the length of the delete. A
   * bounded id list keeps each statement short and the table available; the cron
   * calls back until a pass deletes nothing.
   */
  async purgeBatch(remove, find) {
    try {
      const rows = await find();
      if (rows.length === 0) {
        return ok(0);
      }
      const { count } = await remove(rows.map((row) => row.id));
      return ok(count);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
};
function sessionsToClaim(data) {
  if (data.backfillEarlierSessions) {
    return { visitorId: data.visitorId, userId: null };
  }
  return data.sessionId === null ? { sessionId: "" } : { sessionId: data.sessionId };
}

// src/use-cases/analytics/erase-analytics-data.ts
var EraseAnalyticsDataUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  // Both delegate directly. The `isErr` guard that used to sit here re-wrapped a
  // success into an identical success and returned the failure unchanged — an
  // equivalent mutant in both directions, which is the precise signature of a
  // branch that cannot affect an outcome. The Result type already propagates.
  async byVisitor(visitorId) {
    return this.analyticsRepository.deleteVisitorData(visitorId);
  }
  async byUser(userId) {
    return this.analyticsRepository.deleteDataForUser(userId);
  }
};

// src/use-cases/factories/make-erase-analytics-data-use-case.ts
function makeEraseAnalyticsDataUseCase() {
  return new EraseAnalyticsDataUseCase(new PrismaAnalyticsRepository());
}

// src/lib/analytics/truncate-ip.ts
var import_node_net = __toESM(require("net"));
var import_ipaddr = __toESM(require("ipaddr.js"));
var IPV4_PREFIX_BITS = 24;
var IPV6_PREFIX_BITS = 48;
function truncateIp(ip) {
  if (!ip) {
    return null;
  }
  const trimmed = ip.trim();
  if (hasNonStandardDottedQuad(trimmed)) {
    return null;
  }
  try {
    const address = import_ipaddr.default.process(trimmed);
    return address.kind() === "ipv4" ? import_ipaddr.default.IPv4.networkAddressFromCIDR(`${address.toString()}/${IPV4_PREFIX_BITS}`).toString() : import_ipaddr.default.IPv6.networkAddressFromCIDR(`${address.toString()}/${IPV6_PREFIX_BITS}`).toString();
  } catch {
    return null;
  }
}
function hasNonStandardDottedQuad(ip) {
  const dotted = ip.slice(ip.lastIndexOf(":") + 1);
  if (!dotted.includes(".")) {
    return false;
  }
  return !import_node_net.default.isIPv4(dotted);
}

// src/lib/analytics/user-agent-parser.ts
var BROWSER_PATTERNS = [
  [/edg(?:e|a|ios)?\//i, "Edge"],
  [/(?:opr|opera)\//i, "Opera"],
  [/samsungbrowser\//i, "Samsung Internet"],
  [/(?:firefox|fxios)\//i, "Firefox"],
  [/(?:chrome|crios)\//i, "Chrome"],
  [/safari\//i, "Safari"]
];
var OS_PATTERNS = [
  [/windows nt/i, "Windows"],
  [/android/i, "Android"],
  [/(?:iphone|ipad|ipod)/i, "iOS"],
  [/mac os x/i, "macOS"],
  [/linux/i, "Linux"]
];
var TABLET_HINTS = ["ipad", "tablet", "playbook", "silk", "kindle"];
var MOBILE_HINTS = ["mobile", "iphone", "ipod", "phone"];
function firstMatch(userAgent, patterns) {
  return patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}
function detectDevice(userAgent) {
  const lower = userAgent.toLowerCase();
  if (TABLET_HINTS.some((hint) => lower.includes(hint))) {
    return "tablet";
  }
  if (lower.includes("android")) {
    return lower.includes("mobile") ? "mobile" : "tablet";
  }
  if (MOBILE_HINTS.some((hint) => lower.includes(hint))) {
    return "mobile";
  }
  return firstMatch(userAgent, OS_PATTERNS) === null ? null : "desktop";
}
function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { browser: null, os: null, device: null };
  }
  return {
    browser: firstMatch(userAgent, BROWSER_PATTERNS),
    os: firstMatch(userAgent, OS_PATTERNS),
    device: detectDevice(userAgent)
  };
}

// src/http/controllers/analytics/session-context.ts
var UTM_PARAMS = {
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmTerm: "utm_term",
  utmContent: "utm_content"
};
function utmParams(query) {
  return Object.fromEntries(
    Object.entries(UTM_PARAMS).map(([field, param]) => [field, query[param] || null])
  );
}
function sessionContext(request) {
  return {
    // `request.ip`, not a hand-parsed X-Forwarded-For. Fastify computes it with
    // @fastify/proxy-addr under the `trustProxy` setting in app.ts, so the trust
    // policy lives in one place: narrowing `trustProxy` to a known proxy subnet
    // later is a config change, and this keeps honouring it for free. The helper
    // this replaces read the left-most header entry unconditionally, which
    // bypassed that policy entirely.
    ipAddress: truncateIp(request.ip),
    ...parseUserAgent(request.headers["user-agent"]),
    language: preferredLanguage(request),
    ...utmParams(request.query)
  };
}
function preferredLanguage(request) {
  const header = request.headers["accept-language"];
  if (!header) {
    return null;
  }
  return header.split(",")[0].trim().slice(0, VALIDATION_LIMITS.ANALYTICS_LANGUAGE_MAX) || null;
}
function analyticsResponseHeaders(reply) {
  reply.header("Cache-Control", "no-store");
  reply.header("Vary", "Origin");
  reply.header("X-Content-Type-Options", "nosniff");
}

// src/http/controllers/analytics/erase-my-data.controller.ts
async function eraseMyData(_request, reply) {
  analyticsResponseHeaders(reply);
  const userId = getUserId();
  if (!userId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send();
  }
  const result = await makeEraseAnalyticsDataUseCase().byUser(userId);
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  reply.clearCookie(VISITOR_COOKIE, trackingCookieOptions);
  reply.clearCookie(SESSION_COOKIE, trackingCookieOptions);
  reply.clearCookie(CONSENT_COOKIE, consentCookieOptions);
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/http/presenters/analytics-presenter.ts
var AnalyticsPresenter = class {
  static visitorToHTTP(visitor) {
    return {
      visitorId: visitor.visitorId,
      firstSeenAt: visitor.firstSeenAt,
      lastSeenAt: visitor.lastSeenAt,
      sessionCount: visitor.sessionCount,
      firstUtmSource: visitor.firstUtmSource,
      firstUtmCampaign: visitor.firstUtmCampaign,
      firstLandingPath: visitor.firstLandingPath,
      userId: visitor.userId
    };
  }
  static pagesReadToHTTP(events) {
    return events.map((event) => ({
      path: event.path,
      title: event.title,
      durationMs: event.durationMs,
      scrollDepth: event.scrollDepth,
      occurredAt: event.occurredAt
    }));
  }
  /**
   * Visits, each carrying the start of the one before it.
   *
   * Computed here because the rows arrive newest-first and the previous visit is
   * simply the next element — the window function the specification's SQL used
   * is unnecessary once the ordering is known, and doing it here keeps every
   * client from reimplementing it.
   */
  static visitsToHTTP(sessions) {
    return sessions.map((session, index) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      durationMs: session.durationMs,
      landingPath: session.landingPath,
      exitPath: session.exitPath,
      pageViewCount: session.pageViewCount,
      isBounce: session.isBounce,
      browser: session.browser,
      os: session.os,
      device: session.device,
      utmSource: session.utmSource,
      utmCampaign: session.utmCampaign,
      previousVisitAt: sessions[index + 1]?.startedAt ?? null
    }));
  }
};

// src/use-cases/errors/visitor-not-found-error.ts
var VisitorNotFoundError = class extends DomainError {
  constructor() {
    super(ANALYTICS_ERRORS.VISITOR_NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/analytics/get-visitor-analytics.ts
var GetVisitorAnalyticsUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  async execute(request) {
    const visitorResult = await this.analyticsRepository.findVisitorByVisitorId(request.visitorId);
    if (isErr(visitorResult)) {
      return visitorResult;
    }
    if (visitorResult.value === null) {
      return err(new VisitorNotFoundError());
    }
    const pagesResult = await this.analyticsRepository.findPagesRead({
      visitorId: request.visitorId,
      limit: request.pagesLimit,
      cursor: request.cursor
    });
    if (isErr(pagesResult)) {
      return pagesResult;
    }
    const visitsResult = await this.analyticsRepository.findVisits(request.visitorId, request.visitsLimit);
    if (isErr(visitsResult)) {
      return visitsResult;
    }
    return ok({ visitor: visitorResult.value, pagesRead: pagesResult.value, visits: visitsResult.value });
  }
  async byUser(userId, limit) {
    return this.analyticsRepository.findVisitorsByUserId(userId, limit);
  }
};

// src/use-cases/factories/make-get-visitor-analytics-use-case.ts
function makeGetVisitorAnalyticsUseCase() {
  return new GetVisitorAnalyticsUseCase(new PrismaAnalyticsRepository());
}

// src/http/controllers/analytics/get-visitor-analytics.controller.ts
async function getVisitorAnalytics(request, reply) {
  const { visitorId } = request.params;
  const { limit, cursor } = request.query;
  const result = await makeGetVisitorAnalyticsUseCase().execute({
    pagesLimit: limit,
    visitsLimit: VALIDATION_LIMITS.ANALYTICS_READ_VISITS_LIMIT,
    visitorId,
    cursor
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { visitor, pagesRead, visits } = result.value;
  return reply.code(HTTP_STATUS.OK).send({
    visitor: AnalyticsPresenter.visitorToHTTP(visitor),
    pagesRead: AnalyticsPresenter.pagesReadToHTTP(pagesRead),
    visits: AnalyticsPresenter.visitsToHTTP(visits),
    // Null when this page was not full: there is nothing after it, and returning
    // a cursor anyway would have the client fetch one guaranteed-empty page.
    nextCursor: pagesRead.length === limit ? pagesRead.at(-1)?.occurredAt ?? null : null
  });
}

// src/http/cookies/consent.ts
var CONSENT_VERSION = "v1";
var NO_CONSENT = { analytics: false, marketing: false };
function parseConsent(raw) {
  if (!raw) {
    return NO_CONSENT;
  }
  const prefix = `${CONSENT_VERSION}:`;
  if (!raw.startsWith(prefix)) {
    return NO_CONSENT;
  }
  const granted = new Set(
    raw.slice(prefix.length).split(",").map((pair) => pair.trim())
  );
  return {
    analytics: granted.has("analytics=1"),
    marketing: granted.has("marketing=1")
  };
}
function consentOf(request) {
  return parseConsent(request.cookies[CONSENT_COOKIE]);
}
function hasAnalyticsConsent(request) {
  return consentOf(request).analytics;
}

// src/use-cases/analytics/identify-visitor.ts
var IdentifyVisitorUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  async execute(request) {
    const visitorResult = await this.analyticsRepository.upsertVisitor({
      visitorId: request.visitorId,
      userId: request.userId
    });
    if (isErr(visitorResult)) {
      return visitorResult;
    }
    const linkResult = await this.analyticsRepository.linkSessionsToUser({
      visitorId: request.visitorId,
      sessionId: request.sessionId,
      userId: request.userId,
      backfillEarlierSessions: request.backfillEarlierSessions
    });
    if (isErr(linkResult)) {
      return linkResult;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-identify-visitor-use-case.ts
function makeIdentifyVisitorUseCase() {
  return new IdentifyVisitorUseCase(new PrismaAnalyticsRepository());
}

// src/http/controllers/analytics/identify-visitor.controller.ts
async function identifyVisitor(request, reply) {
  analyticsResponseHeaders(reply);
  const userId = getUserId();
  if (!userId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send();
  }
  if (request.visitorId === null || !hasAnalyticsConsent(request)) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  }
  const result = await makeIdentifyVisitorUseCase().execute({
    visitorId: request.visitorId,
    sessionId: request.sessionId,
    backfillEarlierSessions: env.ANALYTICS_BACKFILL_IDENTITY,
    userId
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/http/controllers/analytics/list-visitors-by-user.controller.ts
async function listVisitorsByUser(request, reply) {
  const { userId, limit } = request.query;
  const result = await makeGetVisitorAnalyticsUseCase().byUser(userId, limit);
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.code(HTTP_STATUS.OK).send({
    visitors: result.value.map((visitor) => AnalyticsPresenter.visitorToHTTP(visitor))
  });
}

// src/http/controllers/analytics/revoke-consent.controller.ts
async function revokeConsent(request, reply) {
  analyticsResponseHeaders(reply);
  reply.clearCookie(VISITOR_COOKIE, trackingCookieOptions);
  reply.clearCookie(SESSION_COOKIE, trackingCookieOptions);
  reply.clearCookie(CONSENT_COOKIE, consentCookieOptions);
  if (request.visitorId === null) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  }
  const result = await makeEraseAnalyticsDataUseCase().byVisitor(request.visitorId);
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/http/controllers/analytics/start-session.controller.ts
var import_node_crypto5 = require("crypto");
var import_zod20 = require("zod");

// src/use-cases/analytics/start-analytics-session.ts
function toVisitorInput(request) {
  return {
    visitorId: request.visitorId,
    userId: request.userId,
    // A created visitor already counts as one session; only a RETURNING visitor
    // starting a new session increments, or the first visit is counted twice.
    countNewSession: request.isNewSession && !request.isNewVisitor,
    // First-touch attribution is written on create and never updated, so passing
    // it on every call is safe and spares the caller from knowing that.
    firstUtmSource: request.utmSource,
    firstUtmMedium: request.utmMedium,
    firstUtmCampaign: request.utmCampaign,
    firstLandingPath: request.landingPath
  };
}
function toSessionInput(request) {
  return {
    sessionId: request.sessionId,
    visitorId: request.visitorId,
    userId: request.userId,
    ipAddress: request.ipAddress,
    browser: request.browser,
    os: request.os,
    device: request.device,
    language: request.language,
    referrer: request.referrer,
    landingPath: request.landingPath,
    utmSource: request.utmSource,
    utmMedium: request.utmMedium,
    utmCampaign: request.utmCampaign,
    utmTerm: request.utmTerm,
    utmContent: request.utmContent
  };
}
var StartAnalyticsSessionUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  async execute(request) {
    const visitorResult = await this.analyticsRepository.upsertVisitor(toVisitorInput(request));
    if (isErr(visitorResult)) {
      return visitorResult;
    }
    const sessionResult = await this.analyticsRepository.upsertSession(toSessionInput(request));
    if (isErr(sessionResult)) {
      return sessionResult;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-start-analytics-session-use-case.ts
function makeStartAnalyticsSessionUseCase() {
  return new StartAnalyticsSessionUseCase(new PrismaAnalyticsRepository());
}

// src/http/controllers/analytics/start-session.controller.ts
var startSessionSchema = import_zod20.z.object({
  /**
   * Forces a new session id even when the current one is still valid.
   *
   * The logout hook: without it, the next person to use this browser would keep
   * browsing inside the previous user's session.
   */
  rotate: import_zod20.z.boolean().default(false),
  // `.nullable().default(null)` rather than `.optional()` so the schema, not the
  // controller, is where "absent means null" is decided. The `?? null` chain it
  // replaces put four branches in a function whose only real decisions are
  // "consented?" and "did the write fail?".
  landingPath: import_zod20.z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_PATH_MAX).nullable().default(null),
  referrer: import_zod20.z.string().max(VALIDATION_LIMITS.ANALYTICS_REFERRER_MAX).nullable().default(null)
});
function resolveIdentity(request, rotate) {
  const reusableSession = rotate ? null : request.sessionId;
  return {
    visitorId: request.visitorId ?? (0, import_node_crypto5.randomUUID)(),
    sessionId: reusableSession ?? (0, import_node_crypto5.randomUUID)(),
    isNewVisitor: request.visitorId === null,
    isNewSession: reusableSession === null
  };
}
function issueCookies(reply, identity) {
  reply.setCookie(VISITOR_COOKIE, identity.visitorId, { ...trackingCookieOptions, maxAge: VISITOR_MAX_AGE });
  reply.setCookie(SESSION_COOKIE, identity.sessionId, { ...trackingCookieOptions, maxAge: SESSION_MAX_AGE });
}
async function startSession(request, reply) {
  analyticsResponseHeaders(reply);
  if (!hasAnalyticsConsent(request)) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  }
  const body = startSessionSchema.parse(request.body ?? {});
  const identity = resolveIdentity(request, body.rotate);
  issueCookies(reply, identity);
  const result = await makeStartAnalyticsSessionUseCase().execute({
    ...identity,
    userId: getUserId() ?? null,
    landingPath: body.landingPath,
    referrer: body.referrer,
    ...sessionContext(request)
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/use-cases/analytics/track-analytics.ts
function toVisitorInput2(request) {
  return {
    visitorId: request.visitorId,
    userId: request.userId,
    firstUtmSource: request.utmSource,
    firstUtmMedium: request.utmMedium,
    firstUtmCampaign: request.utmCampaign,
    firstLandingPath: request.path
  };
}
function toSessionInput2(request) {
  return {
    sessionId: request.sessionId,
    visitorId: request.visitorId,
    userId: request.userId,
    ipAddress: request.ipAddress,
    browser: request.browser,
    os: request.os,
    device: request.device,
    language: request.language,
    referrer: request.referrer,
    landingPath: request.path,
    utmSource: request.utmSource,
    utmMedium: request.utmMedium,
    utmCampaign: request.utmCampaign,
    utmTerm: request.utmTerm,
    utmContent: request.utmContent
  };
}
function toEventInput(request) {
  return {
    sessionId: request.sessionId,
    eventType: request.eventType,
    path: request.path,
    title: request.title,
    referrer: request.referrer,
    durationMs: request.durationMs,
    scrollDepth: request.scrollDepth,
    payload: request.payload
  };
}
var TrackAnalyticsUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  async execute(request) {
    const visitorResult = await this.analyticsRepository.upsertVisitor(toVisitorInput2(request));
    if (isErr(visitorResult)) {
      return visitorResult;
    }
    const sessionResult = await this.analyticsRepository.upsertSession(toSessionInput2(request));
    if (isErr(sessionResult)) {
      return sessionResult;
    }
    const eventResult = await this.analyticsRepository.createEvent(toEventInput(request));
    if (isErr(eventResult)) {
      return eventResult;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-track-analytics-use-case.ts
function makeTrackAnalyticsUseCase() {
  const analyticsRepository = new PrismaAnalyticsRepository();
  return new TrackAnalyticsUseCase(analyticsRepository);
}

// src/http/controllers/analytics/track-event.controller.ts
function ingestibleIdentity(request) {
  const { visitorId, sessionId } = request;
  if (visitorId === null || sessionId === null || !hasAnalyticsConsent(request)) {
    return null;
  }
  return { visitorId, sessionId };
}
async function trackEvent(request, reply) {
  analyticsResponseHeaders(reply);
  const identity = ingestibleIdentity(request);
  if (identity === null) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  }
  const { events } = request.body;
  reply.setCookie(SESSION_COOKIE, identity.sessionId, { ...trackingCookieOptions, maxAge: SESSION_MAX_AGE });
  const context = sessionContext(request);
  const userId = getUserId() ?? null;
  const trackAnalyticsUseCase = makeTrackAnalyticsUseCase();
  for (const event of events) {
    const result = await trackAnalyticsUseCase.execute({
      ...identity,
      userId,
      ...context,
      ...event
    });
    if (isErr(result)) {
      return HttpErrorMapper.map(result.error, reply);
    }
  }
  return reply.code(HTTP_STATUS.NO_CONTENT).send();
}

// src/http/schemas/analytics/track-event-schema.ts
var import_zod21 = require("zod");
var EVENT_TYPES = [
  "page_view",
  "page_exit",
  "click",
  "form_start",
  "form_submit",
  "scroll_depth",
  "search",
  "outbound_click"
];
var payloadSchema = import_zod21.z.record(
  import_zod21.z.string().max(VALIDATION_LIMITS.ANALYTICS_PAYLOAD_VALUE_MAX),
  import_zod21.z.union([import_zod21.z.string().max(VALIDATION_LIMITS.ANALYTICS_PAYLOAD_VALUE_MAX), import_zod21.z.number(), import_zod21.z.boolean(), import_zod21.z.null()])
).refine(
  (payload) => Object.keys(payload).length <= VALIDATION_LIMITS.ANALYTICS_PAYLOAD_KEYS_MAX,
  `payload: m\xE1ximo de ${VALIDATION_LIMITS.ANALYTICS_PAYLOAD_KEYS_MAX} chaves`
);
var trackEventSchema = import_zod21.z.object({
  eventType: import_zod21.z.enum(EVENT_TYPES),
  path: import_zod21.z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_PATH_MAX),
  title: import_zod21.z.string().max(VALIDATION_LIMITS.ANALYTICS_TITLE_MAX).optional(),
  /**
   * Any string, not `z.url()`: this carries the INTERNAL referrer — the path of
   * the previous page — as often as an absolute URL, and `z.url()` would reject
   * `/post/anterior` and silently drop the navigation graph.
   */
  referrer: import_zod21.z.string().max(VALIDATION_LIMITS.ANALYTICS_REFERRER_MAX).optional(),
  durationMs: import_zod21.z.number().int().min(0).max(VALIDATION_LIMITS.ANALYTICS_DURATION_MS_MAX).optional(),
  scrollDepth: import_zod21.z.number().int().min(0).max(VALIDATION_LIMITS.ANALYTICS_SCROLL_DEPTH_MAX).optional(),
  payload: payloadSchema.optional()
});
var trackEventsBatchSchema = import_zod21.z.object({
  events: import_zod21.z.array(trackEventSchema).min(1).max(VALIDATION_LIMITS.ANALYTICS_EVENTS_PER_BATCH_MAX)
});

// src/http/schemas/analytics/visitor-analytics-schema.ts
var import_zod22 = require("zod");
var visitorAnalyticsParamsSchema = import_zod22.z.object({
  visitorId: import_zod22.z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_VISITOR_ID_MAX)
});
var visitorAnalyticsQuerySchema = import_zod22.z.object({
  limit: import_zod22.z.coerce.number().int().min(1).max(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_MAX).default(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_DEFAULT),
  /** `occurredAt` of the previous page's last row. */
  cursor: import_zod22.z.coerce.date().nullable().default(null)
});
var visitorsByUserQuerySchema = import_zod22.z.object({
  userId: import_zod22.z.uuid(),
  limit: import_zod22.z.coerce.number().int().min(1).max(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_MAX).default(VALIDATION_LIMITS.ANALYTICS_READ_PAGE_DEFAULT)
});

// src/http/controllers/analytics/analytics.routes.ts
var EVENTS_BODY_LIMIT = 16 * 1024;
async function analyticsRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  await app2.register(ingestionRoutes);
  await app2.register(adminReadRoutes);
}
async function ingestionRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  await app2.register(analyticsIdentity);
  app2.addHook("onRequest", verifyAnalyticsProxy);
  app2.post(
    "/session",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session },
      schema: { tags: ["Analytics"], summary: "Start session" }
    },
    startSession
  );
  app2.post(
    "/events",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.events },
      bodyLimit: EVENTS_BODY_LIMIT,
      schema: { tags: ["Analytics"], summary: "Track events", body: trackEventsBatchSchema }
    },
    trackEvent
  );
  app2.post(
    "/identify",
    {
      onRequest: [verifyJwt],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify },
      schema: { tags: ["Analytics"], summary: "Identify visitor" }
    },
    identifyVisitor
  );
  app2.post(
    "/consent/revoke",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session },
      schema: { tags: ["Analytics"], summary: "Revoke consent" }
    },
    revokeConsent
  );
  app2.delete(
    "/me",
    {
      onRequest: [verifyJwt],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify },
      schema: { tags: ["Analytics"], summary: "Erase my data" }
    },
    eraseMyData
  );
}
async function adminReadRoutes(appInst) {
  const app2 = appInst.withTypeProvider();
  const adminOnly = [verifyJwt, verifyUserRole([import_client8.UserRole.ADMIN])];
  app2.get(
    "/visitors",
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read },
      schema: { tags: ["Analytics"], summary: "List visitors by user", querystring: visitorsByUserQuerySchema }
    },
    listVisitorsByUser
  );
  app2.get(
    "/visitors/:visitorId",
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read },
      schema: {
        tags: ["Analytics"],
        summary: "Get visitor analytics",
        params: visitorAnalyticsParamsSchema,
        querystring: visitorAnalyticsQuerySchema
      }
    },
    getVisitorAnalytics
  );
}

// src/http/routes.ts
var import_fastify_type_provider_zod = require("fastify-type-provider-zod");
async function appRoutes(app2) {
  app2.setValidatorCompiler(import_fastify_type_provider_zod.validatorCompiler);
  app2.setSerializerCompiler(import_fastify_type_provider_zod.serializerCompiler);
  app2.register(usersRoutes, { prefix: "/users" });
  app2.register(formsRoutes, { prefix: "/forms" });
  app2.register(churchesRoutes, { prefix: "/churches" });
  app2.register(analyticsRoutes, { prefix: "/analytics" });
}

// src/app.ts
var import_uuid = require("uuid");
var import_zod24 = __toESM(require("zod"));
var import_jwt = __toESM(require("@fastify/jwt"));
var import_cors = __toESM(require("@fastify/cors"));
var import_cookie2 = __toESM(require("@fastify/cookie"));

// src/http/plugins/async-context.plugin.ts
var import_fastify_plugin2 = __toESM(require("fastify-plugin"));
var asyncContextPlugin = async (app2) => {
  app2.addHook("onRequest", (request, _reply, done) => {
    const requestId = request.id;
    const requestInfo = {
      host: request.host,
      protocol: request.protocol,
      userAgent: request.headers["user-agent"] || ""
    };
    asyncLocalStorage.run(
      {
        requestId,
        requestInfo
      },
      done
    );
  });
};
var asyncContext = (0, import_fastify_plugin2.default)(asyncContextPlugin, {
  name: "async-context"
});

// src/http/plugins/rate-limit.plugin.ts
var import_rate_limit5 = __toESM(require("@fastify/rate-limit"));

// src/lib/infra/rate-limiter/rate-limit-health-probe.ts
var SUBSYSTEM = { subsystem: "http-rate-limit" };
function createProbeReporter() {
  return new OutageReporter({
    messages: {
      degraded: RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      stillDegraded: RATE_LIMITER_LOGS.HTTP_INFRA_STILL_DEGRADED,
      recovered: RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED
    },
    onDegraded: () => collectMetricsHttpRateLimitDegraded?.inc(SUBSYSTEM),
    onRecovered: () => collectMetricsHttpRateLimitRecovered?.inc(SUBSYSTEM)
  });
}
var RateLimitHealthProbe = class {
  redis;
  intervalMs;
  reporter;
  timer = null;
  constructor(options) {
    this.redis = options.redis;
    this.intervalMs = options.intervalMs ?? env.REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS;
    this.reporter = options.reporter ?? createProbeReporter();
  }
  get degraded() {
    return this.reporter.degraded;
  }
  /**
   * Probes once immediately so the gauge has a value before the first scrape,
   * then on the interval. Starting twice is a no-op rather than a second timer.
   */
  start() {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => void this.check(), this.intervalMs);
    this.timer.unref();
    void this.check();
  }
  stop() {
    clearInterval(this.timer ?? void 0);
    this.timer = null;
    this.reporter.reset();
  }
  /** One observation. Never rejects: a probe that throws is a probe that lies. */
  async check() {
    try {
      await this.redis.ping();
      collectMetricsHttpRateLimitRedisUp?.set(SUBSYSTEM, 1);
      this.reporter.succeeded(SUBSYSTEM);
      return true;
    } catch (error) {
      collectMetricsHttpRateLimitRedisUp?.set(SUBSYSTEM, 0);
      this.reporter.failed(SUBSYSTEM, asLoggableError(error));
      return false;
    }
  }
};
function rateLimitHealthProbeFor(redis) {
  return new RateLimitHealthProbe({ redis });
}

// src/http/plugins/rate-limit.plugin.ts
var import_fastify_plugin3 = __toESM(require("fastify-plugin"));
var httpRateLimitPlugin = async (app2) => {
  app2.addHook("onRoute", (routeOptions) => {
    try {
      if (!routeOptions.config) {
        routeOptions.config = { rateLimit: HTTP_RATE_LIMIT_POLICIES.global };
        return;
      }
      routeOptions.config.rateLimit ??= HTTP_RATE_LIMIT_POLICIES.global;
    } catch {
    }
  });
  await app2.register(import_rate_limit5.default, {
    global: true,
    max: HTTP_RATE_LIMIT_POLICIES.global.max,
    timeWindow: HTTP_RATE_LIMIT_POLICIES.global.timeWindow,
    hook: "onRequest",
    keyGenerator: (request) => request.ip,
    // Redis is the single source of truth for the limit. No local fallback and no
    // second counting algorithm: one limiter, one store.
    redis: getRedisRateLimit(),
    // Fail OPEN. The rate-limiter connection is deliberately impatient
    // (commandTimeout 100 ms, no offline queue, no retries), so `false` here made
    // a merely slow Redis return HTTP 500 to every caller — the limiter becoming
    // the outage it exists to prevent. Skipping the limit is the lesser harm; the
    // greater one would be doing it quietly, which is what the health probe below
    // is for.
    skipOnError: true
  });
  const healthProbe = rateLimitHealthProbeFor(getRedisRateLimit());
  healthProbe.start();
  app2.addHook("onClose", () => {
    healthProbe.stop();
  });
};
var httpRateLimit = (0, import_fastify_plugin3.default)(httpRateLimitPlugin, {
  name: "http-rate-limit"
});

// src/http/plugins/error-handler.plugin.ts
var import_fastify_plugin4 = __toESM(require("fastify-plugin"));
var import_zod23 = __toESM(require("zod"));
var import_node3 = require("@sentry/node");

// src/messages/errors/http.ts
var HTTP_ERRORS = {
  INTERNAL_SERVER: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Erro interno do servidor!"
  },
  INVALID_JSON: {
    code: "INVALID_JSON",
    message: "O corpo da requisi\xE7\xE3o n\xE3o est\xE1 em formato JSON v\xE1lido. Verifique a estrutura dos dados enviados."
  },
  RESOURCE_NOT_FOUND: {
    code: "RESOURCE_NOT_FOUND",
    message: "Recurso n\xE3o encontrado!"
  },
  SERVICE_UNAVAILABLE: {
    code: "SERVICE_UNAVAILABLE",
    message: "Servi\xE7o temporariamente indispon\xEDvel. Por favor, tente novamente mais tarde."
  }
};

// src/messages/errors/validation.ts
var VALIDATION_ERRORS = {
  ZOD_VALIDATION: {
    code: "VALIDATION_ERROR",
    message: "Dados de registro inv\xE1lidos!"
  }
};

// src/errors/http-errors/zod-validation-error.ts
var ZodValidationError = class extends AppError {
  constructor(issues) {
    super(
      {
        code: VALIDATION_ERRORS.ZOD_VALIDATION.code,
        message: VALIDATION_ERRORS.ZOD_VALIDATION.message,
        issues
      },
      "BAD_REQUEST" /* BAD_REQUEST */
    );
  }
};

// src/http/plugins/error-handler.plugin.ts
function captureWithRequestContext(error, request) {
  if (!env.SENTRY_DSN) {
    return;
  }
  (0, import_node3.withScope)((scope) => {
    const requestId = getRequestId();
    const userId = getUserId();
    if (userId) {
      scope.setUser({ id: userId });
    }
    scope.setContext("request", {
      requestId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    });
    scope.setTag("route", request.routeOptions?.url ?? request.url);
    scope.setTag("method", request.method);
    scope.setTag("errorType", error.constructor.name);
    (0, import_node3.captureException)(error);
  });
}
function respondZodError(error, _request, reply) {
  const zodValidationError = new ZodValidationError(import_zod23.default.treeifyError(error));
  logger.debug(import_zod23.default.treeifyError(error), "Ocorreu um erro de valida\xE7\xE3o");
  return reply.code(toHttpStatus(zodValidationError.type)).send({
    message: zodValidationError.body.message,
    code: zodValidationError.body.code,
    issues: zodValidationError.body.issues
  });
}
function respondSyntaxError(error, _request, reply) {
  logger.error(error, "JSON inv\xE1lido recebido");
  return reply.code(HTTP_STATUS.BAD_REQUEST).send({
    message: HTTP_ERRORS.INVALID_JSON.message,
    code: HTTP_ERRORS.INVALID_JSON.code
  });
}
function respondDomainError(error, _request, reply) {
  const domainError = error;
  return reply.code(toHttpStatus(domainError.type)).send({
    message: domainError.body.message,
    code: domainError.body.code,
    issues: domainError.body.issues
  });
}
function reportAppError(error, request) {
  if (error.failureMode === "ABORTED" /* ABORTED */) {
    logger.warn({ err: error }, "Requisi\xE7\xE3o cancelada antes da conclus\xE3o (or\xE7amento esgotado ou cliente desconectado)");
    return;
  }
  logger.error({ err: error, cause: error.cause }, "Ocorreu um erro de infraestrutura/sistema");
  captureWithRequestContext(error, request);
}
function respondAppError(error, request, reply) {
  const appError = error;
  const isServiceUnavailable = appError.type === "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */ || appError.type === "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */;
  reportAppError(appError, request);
  return reply.code(toHttpStatus(appError.type)).send({
    message: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.message : HTTP_ERRORS.INTERNAL_SERVER.message,
    code: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.code : HTTP_ERRORS.INTERNAL_SERVER.code
  });
}
function isFastifyError(error) {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}
function respondFastifyError(error, _request, reply) {
  const fastifyError = error;
  return reply.code(fastifyError.statusCode).send({ message: fastifyError.message });
}
function respondUnknownError(error, request, reply) {
  if (error instanceof Error) {
    logger.error(error, "Ocorreu um erro n\xE3o tratado");
    captureWithRequestContext(error, request);
  } else {
    logger.error("Ocorreu um erro n\xE3o tratado: valor lan\xE7ado n\xE3o \xE9 uma inst\xE2ncia de Error");
    captureWithRequestContext(new Error("Valor n\xE3o-Error lan\xE7ado no handler de requisi\xE7\xE3o"), request);
  }
  return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
    message: HTTP_ERRORS.INTERNAL_SERVER.message,
    code: HTTP_ERRORS.INTERNAL_SERVER.code
  });
}
var ERROR_RULES = [
  { matches: (error) => error instanceof import_zod23.ZodError, respond: respondZodError },
  { matches: (error) => error instanceof SyntaxError, respond: respondSyntaxError },
  { matches: (error) => error instanceof DomainError, respond: respondDomainError },
  { matches: (error) => error instanceof AppError, respond: respondAppError },
  { matches: isFastifyError, respond: respondFastifyError }
];
var errorHandlerPlugin = async (app2) => {
  app2.setErrorHandler(async (error, request, reply) => {
    if (reply.sent) {
      logger.warn("Handler de erro chamado ap\xF3s resposta j\xE1 enviada \u2014 ignorando");
      return;
    }
    try {
      const rule = ERROR_RULES.find(({ matches }) => matches(error));
      return await (rule ? rule.respond(error, request, reply) : respondUnknownError(error, request, reply));
    } catch (handlerError) {
      process.stderr.write(`O handler de erro lan\xE7ou uma exce\xE7\xE3o: ${String(handlerError)}
`);
      if (!reply.sent) {
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          message: HTTP_ERRORS.INTERNAL_SERVER.message,
          code: HTTP_ERRORS.INTERNAL_SERVER.code
        });
      }
    }
  });
};
var errorHandler = (0, import_fastify_plugin4.default)(errorHandlerPlugin, {
  name: "error-handler"
});

// src/http/plugins/request-lifecycle.plugin.ts
var import_fastify_plugin5 = __toESM(require("fastify-plugin"));
async function populateUserId(request) {
  try {
    const decoded = await request.jwtVerify();
    setUserId(decoded.sub);
  } catch {
  }
}
var requestLifecyclePlugin = async (app2) => {
  app2.addHook("onRequest", async (request) => {
    await populateUserId(request);
    logger.info(
      {
        method: request.method,
        url: request.url,
        ip: request.ip,
        remotePort: request.socket.remotePort,
        userAgent: request.headers["user-agent"]
      },
      "Requisi\xE7\xE3o recebida"
    );
  });
  app2.addHook("onResponse", (request, reply, done) => {
    logger.info(
      {
        statusCode: reply.statusCode,
        method: request.method,
        url: request.url,
        requestTime: reply.elapsedTime
      },
      "Resposta enviada"
    );
    done();
  });
};
var requestLifecycle = (0, import_fastify_plugin5.default)(requestLifecyclePlugin, {
  name: "request-lifecycle",
  dependencies: ["async-context"]
});

// src/http/plugins/deadline.plugin.ts
var import_fastify_plugin6 = __toESM(require("fastify-plugin"));
var CLIENT_DISCONNECTED_REASON = "CLIENT_DISCONNECTED";
function startRequestDeadline(budgetMs, request, reply) {
  const disconnected = new AbortController();
  request.raw.on("close", () => {
    if (!reply.raw.writableEnded) {
      disconnected.abort(CLIENT_DISCONNECTED_REASON);
    }
  });
  return Deadline.in(budgetMs, { linkedTo: disconnected.signal });
}
var deadlinePlugin = async (app2) => {
  app2.decorateRequest("deadline");
  app2.addHook("onRequest", (request, reply, done) => {
    const budgetMs = request.routeOptions?.config?.deadlineMs;
    request.deadline = budgetMs ? startRequestDeadline(budgetMs, request, reply) : Deadline.none();
    done();
  });
  app2.addHook("onResponse", (request, _reply, done) => {
    request.deadline?.dispose();
    done();
  });
};
var requestDeadline = (0, import_fastify_plugin6.default)(deadlinePlugin, {
  name: "request-deadline"
});

// src/http/cookies/cookie-secrets.ts
function cookieSigningSecrets(current, previous) {
  if (!previous || previous === current) {
    return [current];
  }
  return [current, previous];
}

// src/app.ts
var import_fastify_metrics = __toESM(require("fastify-metrics"));
var import_prom_client7 = __toESM(require("prom-client"));
var import_fastify_type_provider_zod2 = require("fastify-type-provider-zod");
var import_swagger = __toESM(require("@fastify/swagger"));
var import_fastify_api_reference = __toESM(require("@scalar/fastify-api-reference"));
var import_helmet = __toESM(require("@fastify/helmet"));
var import_under_pressure = __toESM(require("@fastify/under-pressure"));
import_zod24.default.config(import_zod24.default.locales.pt());
var app = (0, import_fastify.default)({
  logger: false,
  trustProxy: true,
  routerOptions: {
    ignoreTrailingSlash: true
  },
  genReqId: () => (0, import_uuid.v7)()
}).withTypeProvider();
app.register(import_swagger.default, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "Evangelismo Digital API",
      version: "1.0.0"
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    }
  },
  transform: import_fastify_type_provider_zod2.jsonSchemaTransform
});
app.register(import_fastify_api_reference.default, {
  routePrefix: "/docs"
});
app.register(asyncContext);
var metricsRegistry = getRegistry();
if (metricsRegistry) {
  app.register(import_fastify_metrics.default, {
    promClient: import_prom_client7.default,
    endpoint: null,
    defaultMetrics: { enabled: false },
    routeMetrics: {
      enabled: { histogram: true, summary: false },
      overrides: {
        histogram: { registers: [metricsRegistry] }
      }
    }
  });
}
app.register(import_cors.default, {
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
  maxAge: 3600
});
app.register(httpRateLimit);
app.register(import_helmet.default, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
});
var MAX_EVENT_LOOP_DELAY_TEST = 50;
var MAX_EVENT_LOOP_DELAY_DEFAULT = 1e3;
app.register(import_under_pressure.default, {
  maxEventLoopDelay: env.NODE_ENV === "test" ? MAX_EVENT_LOOP_DELAY_TEST : MAX_EVENT_LOOP_DELAY_DEFAULT,
  maxHeapUsedBytes: 1e9,
  // 1GB
  maxRssBytes: 1e9,
  // 1GB
  healthCheckInterval: 5e3,
  exposeStatusRoute: {
    routeOpts: {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.health.check },
      schema: {
        tags: ["Health"],
        summary: "Verifica o status da aplica\xE7\xE3o",
        description: "Retorna informa\xE7\xF5es sobre uso de mem\xF3ria e tempo de atividade se o banco de dados estiver acess\xEDvel."
      }
    },
    routeResponseSchemaOpts: {
      status: { type: "string" },
      uptime: { type: "number" },
      timestamp: { type: "string" },
      memory: {
        type: "object",
        properties: {
          rss: { type: "string" },
          heapUsed: { type: "string" },
          heapTotal: { type: "string" },
          external: { type: "string" }
        }
      }
    },
    url: "/health"
  },
  healthCheck: async () => {
    const memoryUsage = process.memoryUsage();
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      uptime: process.uptime(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
});
app.register(import_cookie2.default, {
  secret: cookieSigningSecrets(env.COOKIE_SECRET, env.COOKIE_SECRET_PREVIOUS)
});
app.register(import_jwt.default, {
  secret: env.JWT_SECRET
});
app.register(requestLifecycle);
app.register(requestDeadline);
app.register(errorHandler);
app.register(appRoutes);
app.addHook("onClose", async () => {
  logger.info("Finalizando as conex\xF5es do RateLimiter e Redis...");
  try {
    RedisRateLimiter.destroyInstance();
    logger.info("RateLimiter finalizado com sucesso");
  } catch (error) {
    logger.error(error, "Erro ao finalizar o RateLimiter");
  }
  try {
    await closeAllRedisConnections();
    logger.info("Conex\xF5es do Redis fechadas");
  } catch (error) {
    logger.error(error, "Erro ao fechar as conex\xF5es do Redis");
  }
});

// src/server.ts
var import_close_with_grace = __toESM(require("close-with-grace"));

// src/lib/shutdown/crash-shutdown.ts
var import_node4 = require("@sentry/node");
var SENTRY_FLUSH_TIMEOUT_MS = 2e3;
async function crashShutdown(error) {
  logger.fatal({ err: error }, "Travamento n\xE3o tratado detectado, iniciando sequ\xEAncia de encerramento por falha...");
  await reportToSentry(error);
}
async function reportToSentry(error) {
  try {
    (0, import_node4.captureException)(error instanceof Error ? error : new Error(String(error)));
    await (0, import_node4.flush)(SENTRY_FLUSH_TIMEOUT_MS);
    logger.info("Logs do Sentry enviados com sucesso.");
  } catch (sentryError) {
    logger.error({ err: sentryError }, "Erro ao enviar os logs do Sentry durante o encerramento por travamento");
  }
}

// src/metrics-server.ts
var import_fastify2 = __toESM(require("fastify"));
var import_prom_client9 = require("prom-client");

// src/lib/metrics/bullmq-metrics.ts
var import_prom_client8 = require("prom-client");
var registry7 = getRegistry();
var collectMetricsBullmqJobs = registry7 ? new import_prom_client8.Gauge({
  name: "bullmq_jobs",
  help: "Current job count by state",
  labelNames: ["queue", "state"],
  registers: [registry7]
}) : null;
var queues = /* @__PURE__ */ new Map();
async function collectBullMQMetrics() {
  if (!collectMetricsBullmqJobs) return;
  for (const [name, queue] of queues) {
    const counts = await queue.getJobCounts();
    for (const [state, count] of Object.entries(counts)) {
      collectMetricsBullmqJobs.set({ queue: name, state }, count);
    }
  }
}

// src/metrics-server.ts
var METRICS_COLLECTION_TIMEOUT_MS = 2e3;
var metricsServer = null;
var registry8 = getRegistry();
var metricsCollectionErrors = registry8 ? new import_prom_client9.Counter({
  name: "metrics_collection_errors_total",
  help: "Errors during metrics collection",
  labelNames: ["source"],
  registers: [registry8]
}) : null;
function withTimeout(promise, ms3, source) {
  return abortRace(promise, AbortSignal.timeout(ms3), () => {
    metricsCollectionErrors?.inc({ source });
    throw new Error(`${source} timeout`);
  });
}
async function startMetricsServer(options) {
  if (!env.METRICS_ENABLED) {
    logger.info("Servidor de m\xE9tricas desabilitado");
    return;
  }
  metricsServer = (0, import_fastify2.default)({ logger: false });
  metricsServer.get("/metrics", async (_request, reply) => {
    const currentRegistry = getRegistry();
    if (!currentRegistry) {
      return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send("Metrics disabled");
    }
    try {
      await withTimeout(collectBullMQMetrics(), METRICS_COLLECTION_TIMEOUT_MS, "bullmq");
    } catch (err2) {
      logger.warn({ err: err2 }, "Falha na coleta de m\xE9tricas do BullMQ");
    }
    const results = await Promise.allSettled([
      withTimeout(currentRegistry.metrics(), METRICS_COLLECTION_TIMEOUT_MS, "prom-client")
    ]);
    const output = results.filter((r) => r.status === "fulfilled").map((r) => r.value).join("\n\n");
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return output;
  });
  metricsServer.get("/health", () => ({ status: "ok" }));
  await metricsServer.listen({ host: "0.0.0.0", port: options.port });
  logger.info({ port: options.port }, "Servidor de m\xE9tricas iniciado");
}
async function stopMetricsServer() {
  const server = metricsServer;
  if (!server) return;
  metricsServer = null;
  await server.close();
  logger.info("Servidor de m\xE9tricas parado");
}

// src/server.ts
initSentry();
async function shutdown() {
  await app.close();
  await stopMetricsServer();
}
(0, import_close_with_grace.default)(
  {
    delay: 15e3,
    onTimeout: () => {
      logger.fatal("O tempo limite de limpeza para encerramento expirou ap\xF3s 15s. For\xE7ando a sa\xEDda.");
    }
  },
  async ({ signal, err: err2 }) => {
    if (err2) {
      try {
        await shutdown();
        logger.info("Limpeza de encerramento por travamento conclu\xEDda com sucesso.");
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, "Ocorreu um erro durante a limpeza de encerramento por travamento");
      }
      await crashShutdown(err2);
    } else {
      logger.info({ signal }, `Sinal ${signal ?? "desconhecido"} recebido. Encerrando o servidor graciosamente...`);
      await shutdown();
      logger.info("Servidor encerrado graciosamente.");
    }
  }
);
async function start() {
  try {
    await app.listen({ host: "0.0.0.0", port: env.APP_PORT });
    logger.info(`Servidor iniciado com sucesso! Escutando na porta: ${env.APP_PORT}`);
    try {
      await startMetricsServer({ port: env.METRICS_API_PORT });
    } catch (metricsErr) {
      logger.error({ err: metricsErr }, "Falha ao iniciar o servidor de m\xE9tricas; a API continuar\xE1 sem m\xE9tricas");
      captureError(metricsErr);
    }
  } catch (err2) {
    await crashShutdown(err2);
  }
}
void start();
