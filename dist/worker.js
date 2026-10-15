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
  // Rate limiter nativo do BullMQ no worker de e-mail (coordenado via Redis entre pods).
  // Garante vazão global controlada para o SMTP do Gmail independentemente do número de réplicas.
  MAIL_RATE_LIMIT_MAX: import_zod2.z.coerce.number().int().positive().default(2),
  MAIL_RATE_LIMIT_DURATION_MS: import_zod2.z.coerce.number().int().positive().default(1e3),
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

// src/messages/constants/cron/cron.ts
var CRON_SCHEDULES = {
  /** Every day at midnight (00:00:00) */
  MIDNIGHT_DAILY: "0 0 0 * * *",
  /** Every 5 minutes */
  EVERY_FIVE_MINUTES: "0 */5 * * * *",
  /** Every day at 03:00 (off the midnight sweep) */
  DAILY_3AM: "0 0 3 * * *",
  /** Every day at 04:00 — analytics retention, after the outbox purge at 03:00 */
  DAILY_4AM: "0 0 4 * * *",
  /** Every day at 05:00 — failed outbox events retention, after analytics at 04:00 */
  DAILY_5AM: "0 0 5 * * *"
};

// src/messages/constants/queue/queue.ts
var QUEUE = {
  NAMES: {
    MAIL: "mail-queue",
    MAINTENANCE: "maintenance-queue",
    OUTBOX_DISPATCH: "outbox-dispatch-queue"
  },
  JOBS: {
    OUTBOX_DISPATCH: "outbox-dispatch",
    FIVE_MIN_SWEEP: "five-min-sweep",
    MIDNIGHT_SCAN: "midnight-scan",
    RETENTION_PURGE: "retention-purge",
    ANALYTICS_RETENTION: "analytics-retention",
    FAILED_JOBS_CLEANUP: "failed-jobs-cleanup"
  },
  /**
   * Scheduler ids are the dedup key: every pod upserts the same id, so BullMQ
   * keeps one scheduler and emits one job per tick regardless of pod count.
   * Changing an id orphans the old scheduler in Redis — rename only alongside a
   * `removeJobScheduler` for the previous id.
   */
  SCHEDULER_IDS: {
    FIVE_MIN_SWEEP: "maintenance:five-min-sweep",
    MIDNIGHT_SCAN: "maintenance:midnight-scan",
    RETENTION_PURGE: "maintenance:retention-purge",
    ANALYTICS_RETENTION: "maintenance:analytics-retention",
    FAILED_JOBS_CLEANUP: "maintenance:failed-jobs-cleanup"
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
  SCHEDULER_CONFIGURED: "Agendadores da Outbox configurados: varredura a cada 5 min, seguran\xE7a \xE0 meia-noite, reten\xE7\xE3o \xE0s 03:00 e limpeza de falhas \xE0s 05:00.",
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
  FAILED_PURGED: "Reten\xE7\xE3o de falhas: eventos com falha definitiva removidos da Outbox.",
  FAILED_PURGE_ERROR: "Erro na limpeza de eventos com falha definitiva da Outbox.",
  FIVE_MIN_SWEEP_PENDING_ERROR: "Varredura de 5 min: erro inesperado ao processar eventos PENDING.",
  FIVE_MIN_SWEEP_EXPIRY_ERROR: "Varredura de 5 min: erro inesperado na varredura de expira\xE7\xE3o.",
  RETENTION_CRON_ERROR: "Cron de reten\xE7\xE3o: erro inesperado."
};

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));

// src/lib/async-local-storage/index.ts
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();

// src/lib/logger/index.ts
var ERROR_STACK_BREADCRUMB_LINES = 6;
function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId;
}
function getUserId() {
  return asyncLocalStorage.getStore()?.userId;
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

// src/lib/redis/connections/redis-bullMQ-connection.ts
function createRedisBullMQConnection() {
  const redis = new import_ioredis.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || void 0,
    maxRetriesPerRequest: null,
    // Obrigatório para BullMQ
    // === CORREÇÃO DE INFRAESTRUTURA (DOCKER) ===
    family: 4
    // Força IPv4. Resolve instabilidade de rede no Docker.
    // === CONFIGURAÇÕES DE Tentativa de Conexão ===
    /*retryStrategy: (times) => {
      return Math.min(times * 50, 2000)
    },*/
  });
  attachOutageLogging(redis, "bullmq", REDIS_LOGS.BULLMQ_UNEXPECTED_ERROR);
  return redis;
}
function attachRedisLogger(redis, context) {
  const outageLogger = new RedisOutageLogger({
    subsystem: "bullmq",
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
  });
  redis.on("connect", () => {
    logger.info(`Conex\xE3o Redis (${context}) estabelecida`);
    outageLogger.onRecovery();
  });
  redis.on("ready", () => {
    logger.info(`Redis (${context}) pronto`);
    outageLogger.onRecovery();
  });
  redis.on("error", (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage("error", error);
      return;
    }
    logger.error({ context, err: error.message }, "Instabilidade na conex\xE3o Redis");
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
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
function getRedisForQueue() {
  redisForQueueInstance ??= createRedisBullMQConnection();
  return redisForQueueInstance;
}
function createWorkerConnection() {
  return createRedisBullMQConnection();
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

// src/lib/queue/maintenance-queue.ts
var import_bullmq = require("bullmq");

// src/messages/constants/workers/workers.ts
var WORKER_CONSTANTS = {
  MAIL: {
    CONCURRENCY_LIMIT: 5,
    LOCK_DURATION_MS: 6e4,
    STALLED_INTERVAL_MS: 3e4,
    REMOVE_ON_COMPLETE: {
      age: 3600,
      count: 1e3
    },
    REMOVE_ON_FAIL: {
      age: 604800,
      count: 2e3
    }
  },
  OUTBOX_DISPATCH: {
    CONCURRENCY_LIMIT: 5,
    LOCK_DURATION_MS: 3e4,
    STALLED_INTERVAL_MS: 3e4
  },
  /**
   * Concorrência 1: as varreduras de manutenção são pesadas no banco e já se
   * excluem via DistributedLock. Deixar duas rodarem juntas só trocaria o lock
   * por espera, sem ganho — e a fila nunca tem mais que quatro jobs por hora.
   */
  MAINTENANCE: {
    CONCURRENCY_LIMIT: 1
  },
  QUEUE: {
    JOB_ATTEMPTS: 3,
    BACKOFF_TYPE: "exponential",
    BACKOFF_DELAY_MS: 1e4,
    BACKOFF_JITTER: 0.3
  },
  IDEMPOTENCY_TTL: {
    PROCESSING_SECONDS: 300,
    COMPLETED_SECONDS: 86400
  }
};

// src/lib/queue/maintenance-queue.ts
var maintenanceQueueInstance = null;
function getMaintenanceQueue() {
  if (!maintenanceQueueInstance) {
    const redisForQueue = getRedisForQueue();
    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAINTENANCE);
    maintenanceQueueInstance = new import_bullmq.Queue(QUEUE.NAMES.MAINTENANCE, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
        backoff: {
          type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
          delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS
        },
        removeOnComplete: true,
        removeOnFail: true
      }
    });
    maintenanceQueueInstance.on("error", (err2) => {
      logger.error({ err: err2 }, OUTBOX_LOGS.MAINTENANCE_QUEUE_ERROR);
    });
  }
  return maintenanceQueueInstance;
}

// src/lib/infra/jobs/maintenance-scheduler.ts
var MAINTENANCE_SCHEDULES = [
  {
    schedulerId: QUEUE.SCHEDULER_IDS.FIVE_MIN_SWEEP,
    jobName: QUEUE.JOBS.FIVE_MIN_SWEEP,
    pattern: CRON_SCHEDULES.EVERY_FIVE_MINUTES
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.MIDNIGHT_SCAN,
    jobName: QUEUE.JOBS.MIDNIGHT_SCAN,
    pattern: CRON_SCHEDULES.MIDNIGHT_DAILY
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.RETENTION_PURGE,
    jobName: QUEUE.JOBS.RETENTION_PURGE,
    pattern: CRON_SCHEDULES.DAILY_3AM
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.ANALYTICS_RETENTION,
    jobName: QUEUE.JOBS.ANALYTICS_RETENTION,
    pattern: CRON_SCHEDULES.DAILY_4AM
  },
  {
    schedulerId: QUEUE.SCHEDULER_IDS.FAILED_JOBS_CLEANUP,
    jobName: QUEUE.JOBS.FAILED_JOBS_CLEANUP,
    pattern: CRON_SCHEDULES.DAILY_5AM
  }
];
async function startMaintenanceScheduler(queue = getMaintenanceQueue()) {
  for (const schedule of MAINTENANCE_SCHEDULES) {
    await queue.upsertJobScheduler(
      schedule.schedulerId,
      { pattern: schedule.pattern },
      { name: schedule.jobName, data: { schedulerId: schedule.schedulerId } }
    );
  }
  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED);
}

// src/lib/infra/jobs/maintenance-worker.ts
var import_bullmq2 = require("bullmq");

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
var collectMetricsOutboxEventsClaimed = registry2 ? new import_prom_client2.Counter({
  name: "outbox_events_claimed_total",
  help: "Outbox CAS claim attempts by outcome (claimed | contention)",
  labelNames: ["outcome"],
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
  help: "Pub/Sub wakeup signals published after an outbox write (deprecated in favor of outbox_dispatch_enqueued_total)",
  registers: [registry2]
}) : null;
var collectMetricsOutboxSignalPublishFailed = registry2 ? new import_prom_client2.Counter({
  name: "outbox_signal_publish_failed_total",
  help: "Pub/Sub signal publish failures (deprecated in favor of outbox_dispatch_enqueue_failed_total)",
  registers: [registry2]
}) : null;
var collectMetricsOutboxDispatchEnqueued = registry2 ? new import_prom_client2.Counter({
  name: "outbox_dispatch_enqueued_total",
  help: "Events successfully enqueued to outbox-dispatch queue",
  registers: [registry2]
}) : null;
var collectMetricsOutboxDispatchEnqueueFailed = registry2 ? new import_prom_client2.Counter({
  name: "outbox_dispatch_enqueue_failed_total",
  help: "Failures enqueuing event to outbox-dispatch queue (Redis down)",
  registers: [registry2]
}) : null;

// src/messages/constants/analytics/analytics.ts
var ANALYTICS_CONSTANTS = {
  LOCK_KEYS: {
    ANALYTICS_RETENTION: "lock:analytics-retention"
  },
  LOCK_TTL_MS: {
    DEFAULT: 1e4
  },
  RETENTION: {
    /**
     * One batch per statement, with the lock renewed between batches.
     *
     * A `DELETE` without a bound would take one lock over months of backlog and
     * hold the table for the length of it. The sweep loops until a pass deletes
     * nothing, so a large backlog drains over several passes instead of one long
     * outage.
     */
    BATCH_SIZE: 1e3,
    /** Ceiling on batches per run, so one night's sweep cannot run unbounded. */
    MAX_BATCHES_PER_RUN: 100
  }
};
var ANALYTICS_LOGS = {
  RETENTION_ERROR: "Falha na varredura de reten\xE7\xE3o de analytics",
  RETENTION_DONE: "Varredura de reten\xE7\xE3o de analytics conclu\xEDda"
};

// src/lib/infra/jobs/maintenance-worker.ts
function fiveMinSweepPhases({ processor, maintenance }) {
  return [
    {
      name: "five_min_sweep",
      run: () => maintenance.sweepExpiredEvents(),
      errorMessage: OUTBOX_LOGS.FIVE_MIN_SWEEP_EXPIRY_ERROR
    },
    {
      name: "five_min_pending",
      run: () => processor.processPendingEvents(),
      errorMessage: OUTBOX_LOGS.FIVE_MIN_SWEEP_PENDING_ERROR
    }
  ];
}
function midnightScanPhases({ processor }) {
  return [
    {
      name: "midnight_recovery",
      run: () => processor.processStuckSendingEvents(),
      errorMessage: OUTBOX_LOGS.PHASE1_ERROR,
      onSuccess: OUTBOX_LOGS.PHASE1_DONE,
      sentryContext: { phase: 1 }
    },
    {
      name: "midnight_pending",
      run: () => processor.processPendingEvents(),
      errorMessage: OUTBOX_LOGS.PHASE2_ERROR,
      onSuccess: OUTBOX_LOGS.PHASE2_DONE,
      sentryContext: { phase: 2 }
    }
  ];
}
function retentionPurgePhases({ maintenance }) {
  return [
    {
      name: "retention_purge",
      run: () => maintenance.purgeOldEvents(),
      errorMessage: OUTBOX_LOGS.RETENTION_CRON_ERROR
    }
  ];
}
function analyticsRetentionPhases({ analyticsRetention }) {
  return [
    {
      name: "analytics_retention",
      run: () => analyticsRetention.purgeExpiredData(),
      errorMessage: ANALYTICS_LOGS.RETENTION_ERROR
    }
  ];
}
function failedJobsCleanupPhases({ maintenance }) {
  return [
    {
      name: "failed_jobs_cleanup",
      run: () => maintenance.purgeFailedEvents(),
      errorMessage: OUTBOX_LOGS.FAILED_PURGE_ERROR
    }
  ];
}
var PHASE_BUILDERS = /* @__PURE__ */ new Map([
  [QUEUE.JOBS.FIVE_MIN_SWEEP, fiveMinSweepPhases],
  [QUEUE.JOBS.MIDNIGHT_SCAN, midnightScanPhases],
  [QUEUE.JOBS.RETENTION_PURGE, retentionPurgePhases],
  [QUEUE.JOBS.ANALYTICS_RETENTION, analyticsRetentionPhases],
  [QUEUE.JOBS.FAILED_JOBS_CLEANUP, failedJobsCleanupPhases]
]);
function phasesFor(jobName, deps) {
  return PHASE_BUILDERS.get(jobName)?.(deps) ?? [];
}
function isFinalAttempt(job) {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}
async function runPhase(phase, job) {
  collectMetricsOutboxCronRuns?.inc({ phase: phase.name });
  try {
    await phase.run();
    if (phase.onSuccess) {
      logger.info(phase.onSuccess);
    }
    return null;
  } catch (error) {
    reportPhaseFailure(phase, job, error);
    return { error };
  }
}
function reportPhaseFailure(phase, job, error) {
  if (!isFinalAttempt(job)) {
    collectMetricsOutboxCronFailures?.inc({ phase: phase.name, outcome: "retrying" });
    logger.warn({ error, phase: phase.name, attempt: job.attemptsMade + 1 }, OUTBOX_LOGS.MAINTENANCE_PHASE_RETRYING);
    return;
  }
  collectMetricsOutboxCronFailures?.inc({ phase: phase.name, outcome: "exhausted" });
  logger.error({ error }, phase.errorMessage);
  if (phase.sentryContext) {
    captureError(error, phase.sentryContext);
  } else {
    captureError(error);
  }
}
async function runAllPhases(phases, job) {
  const isMidnightScan = job.name === QUEUE.JOBS.MIDNIGHT_SCAN;
  if (isMidnightScan) {
    logger.info(OUTBOX_LOGS.CRON_START);
  }
  const failures = [];
  for (const phase of phases) {
    const outcome = await runPhase(phase, job);
    if (outcome) {
      failures.push(outcome.error);
    }
  }
  if (isMidnightScan) {
    logger.info(OUTBOX_LOGS.SCAN_DONE);
  }
  return failures;
}
function asThrowable(failures) {
  if (failures.length === 1 && failures[0] instanceof Error) {
    return failures[0];
  }
  return new AggregateError(failures, OUTBOX_LOGS.MAINTENANCE_PHASE_RETRYING);
}
function createMaintenanceJobProcessor(deps) {
  return async (job) => {
    const phases = phasesFor(job.name, deps);
    if (phases.length === 0) {
      logger.warn({ jobName: job.name, jobId: job.id }, OUTBOX_LOGS.MAINTENANCE_JOB_UNKNOWN);
      return;
    }
    const failures = await runAllPhases(phases, job);
    if (failures.length > 0 && !isFinalAttempt(job)) {
      throw asThrowable(failures);
    }
  };
}
function startMaintenanceWorker(deps) {
  const workerConnection = createWorkerConnection();
  attachRedisLogger(workerConnection, "MaintenanceWorker");
  const worker2 = new import_bullmq2.Worker(QUEUE.NAMES.MAINTENANCE, createMaintenanceJobProcessor(deps), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.MAINTENANCE.CONCURRENCY_LIMIT
  });
  logger.info(OUTBOX_LOGS.MAINTENANCE_WORKER_STARTED);
  return worker2;
}

// src/messages/constants/outbox/outbox.ts
var OUTBOX_CONSTANTS = {
  LOCK_KEYS: {
    OUTBOX_PROCESSOR: "lock:outbox-processor",
    OUTBOX_RECOVERY: "lock:outbox-recovery",
    OUTBOX_EXPIRY_SWEEP: "lock:outbox-expiry-sweep",
    OUTBOX_RETENTION: "lock:outbox-retention",
    OUTBOX_FAILED_PURGE: "lock:outbox-failed-purge"
  },
  LOCK_TTL_MS: {
    DEFAULT: 1e4
  },
  THRESHOLDS: {
    /**
     * Time in ms after which a SENDING event is considered stuck (e.g., after a crash).
     * Must exceed the worst-case BullMQ job lifetime (3 attempts x lockDuration + exponential
     * backoff), otherwise recovery could re-dispatch a job that is still being retried.
     */
    STUCK_SENDING_MS: 9e5,
    /** Maximum number of pending events fetched per processing cycle */
    PENDING_FETCH_LIMIT: 50,
    /** Maximum number of stuck SENDING events fetched per recovery cycle */
    STUCK_FETCH_LIMIT: 50,
    /**
     * Maximum dispatch cycles (PENDING -> SENDING transitions) before an event is
     * marked FAILED (terminal). Prevents poison messages from looping forever.
     */
    MAX_DISPATCH_ATTEMPTS: 5
  },
  RETENTION: {
    /** Eventos com mais de N dias são removidos pela retenção diária, qualquer status. */
    DAYS: 14,
    /** Eventos FAILED com mais de N dias são removidos pela limpeza diária de falhas. */
    FAILED_DAYS: 7,
    /** Um lote por chamada, para renovar o lock distribuído entre lotes. */
    BATCH_SIZE: 1e3
  }
};

// src/lib/queue/mail-queue.ts
var import_bullmq3 = require("bullmq");

// src/messages/constants/logs/worker.ts
var WORKER_LOGS = {
  BATCH_ALREADY_SENT: "Lote j\xE1 enviado anteriormente. Limpando DB e abortando duplicata.",
  BULLMQ_NETWORK_GLITCH: "Falha de rede interna do BullMQ ap\xF3s processamento. Ignorando.",
  GENERIC_WORKER_FAILURE: "Falha gen\xE9rica n\xE3o mapeada no worker",
  MAIL_QUEUE_ERROR: "Erro na MailQueue (Producer)",
  OUTBOX_DISPATCH_QUEUE_ERROR: "Erro na OutboxDispatchQueue (Producer)",
  OUTBOX_REVERTED_AFTER_FINAL_FAILURE: "Job falhou definitivamente no BullMQ. Evento revertido para PENDING para nova tentativa de despacho.",
  OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR: "Falha ao reverter evento para PENDING ap\xF3s falha definitiva do job (linha possivelmente j\xE1 removida).",
  FAILURE_HANDLER_ERROR: "Erro inesperado no tratamento de falha de job do worker.",
  EXPIRED_JOB_SKIPPED: "Job com evento expirado: e-mail n\xE3o ser\xE1 enviado; removendo a linha da Outbox.",
  PARTIAL_BATCH_FAILURE: "Falha parcial no lote de e-mails \u2014 alguns foram enviados; apenas os destinat\xE1rios pendentes ser\xE3o re-tentados.",
  PENDING_RECIPIENTS_UPDATE_FAILED: "Falha ao persistir destinat\xE1rios pendentes no banco ap\xF3s envio parcial; o lote completo ser\xE1 re-tentado.",
  JOB_DATA_UPDATE_FAILED: "Falha ao atualizar o payload do job no BullMQ ap\xF3s envio parcial; a re-tentativa interna usar\xE1 o lote completo."
};

// src/lib/queue/mail-queue.ts
var mailQueueInstance = null;
function getMailQueue() {
  if (!mailQueueInstance) {
    const redisForQueue = getRedisForQueue();
    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAIL);
    mailQueueInstance = new import_bullmq3.Queue(QUEUE.NAMES.MAIL, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: WORKER_CONSTANTS.QUEUE.JOB_ATTEMPTS,
        backoff: {
          type: WORKER_CONSTANTS.QUEUE.BACKOFF_TYPE,
          delay: WORKER_CONSTANTS.QUEUE.BACKOFF_DELAY_MS,
          jitter: WORKER_CONSTANTS.QUEUE.BACKOFF_JITTER
        },
        removeOnComplete: WORKER_CONSTANTS.MAIL.REMOVE_ON_COMPLETE,
        removeOnFail: WORKER_CONSTANTS.MAIL.REMOVE_ON_FAIL
      }
    });
    mailQueueInstance.on("error", (err2) => {
      logger.error({ err: err2 }, WORKER_LOGS.MAIL_QUEUE_ERROR);
    });
  }
  return mailQueueInstance;
}

// src/messages/constants/logs/distributed-lock.ts
var LOCK_LOGS = {
  ACQUIRE_FAILED: "Falha ao tentar adquirir Distributed Lock",
  RENEW_FAILED: "Falha ao tentar renovar Distributed Lock",
  RENEW_EXPIRED: "Distributed Lock n\xE3o renovado: expirou ou pertence a outra inst\xE2ncia",
  RELEASE_EXPIRED: "Distributed Lock j\xE1 havia expirado ou pertencia a outra inst\xE2ncia no momento do release",
  RELEASE_FAILED: "Falha ao liberar Distributed Lock (ele expirar\xE1 sozinho pelo TTL)"
};

// src/lib/infra/distributed-lock/distributed-lock.ts
var import_node_crypto = require("crypto");

// src/lib/metrics/lock-metrics.ts
var import_prom_client3 = require("prom-client");
var registry3 = getRegistry();
var collectMetricsLockAcquired = registry3 ? new import_prom_client3.Counter({
  name: "distributed_lock_acquired_total",
  help: "Successful lock acquisitions",
  labelNames: ["key"],
  registers: [registry3]
}) : null;
var collectMetricsLockContention = registry3 ? new import_prom_client3.Counter({
  name: "distributed_lock_contention_total",
  help: "Failed acquisitions (lock held by another)",
  labelNames: ["key"],
  registers: [registry3]
}) : null;
var collectMetricsLockReleased = registry3 ? new import_prom_client3.Counter({
  name: "distributed_lock_released_total",
  help: "Successful releases",
  labelNames: ["key"],
  registers: [registry3]
}) : null;
var collectMetricsLockExpired = registry3 ? new import_prom_client3.Counter({
  name: "distributed_lock_expired_total",
  help: "Release/renew found lock expired or owned by another instance",
  labelNames: ["key"],
  registers: [registry3]
}) : null;
var collectMetricsLockErrors = registry3 ? new import_prom_client3.Counter({
  name: "distributed_lock_errors_total",
  help: "Redis/infrastructure failures during lock operations",
  labelNames: ["operation"],
  registers: [registry3]
}) : null;
var collectMetricsLockDuration = registry3 ? new import_prom_client3.Histogram({
  name: "distributed_lock_duration_seconds",
  help: "Time between acquire and release",
  labelNames: ["key"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [registry3]
}) : null;

// src/lib/infra/distributed-lock/distributed-lock.ts
var lockHoldStart = /* @__PURE__ */ new Map();
var RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;
var RENEW_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;
function getLockRedis() {
  const redisCache = getRedisCache();
  if (typeof redisCache.releaseLock !== "function") {
    redisCache.defineCommand("releaseLock", {
      numberOfKeys: 1,
      lua: RELEASE_SCRIPT
    });
    redisCache.defineCommand("renewLock", {
      numberOfKeys: 1,
      lua: RENEW_SCRIPT
    });
  }
  return redisCache;
}
var DistributedLock = class {
  /**
   * Tenta adquirir um lock exclusivo via SET NX PX (atômico).
   *
   * Gera um token UUID v4 único por aquisição e o armazena como valor da
   * chave Redis. Esse token é o "título de propriedade" do lock: apenas
   * quem o possui pode renová-lo ou liberá-lo.
   *
   * @param key    - Identificador único do recurso (ex: 'lock:outbox-processor')
   * @param ttlMs  - Tempo de vida inicial do lock em ms.
   *                 Serve como teto de segurança contra deadlock eterno em caso de crash.
   * @returns O token do lock se adquirido, null se já estava ocupado por outra instância.
   */
  static async acquire(key, ttlMs) {
    const token = (0, import_node_crypto.randomUUID)();
    const redisCache = getRedisCache();
    try {
      const result = await redisCache.set(key, token, "PX", ttlMs, "NX");
      if (result !== "OK") {
        collectMetricsLockContention?.inc({ key });
        return null;
      }
      recordAcquisition(key, token);
      return token;
    } catch (error) {
      collectMetricsLockErrors?.inc({ operation: "acquire" });
      logger.error({ error, key }, LOCK_LOGS.ACQUIRE_FAILED);
      return null;
    }
  }
  /**
   * Renova o TTL de um lock já adquirido (sliding TTL).
   *
   * Usa um script Lua para verificar atomicamente se o token ainda
   * pertence a esta instância antes de estender o TTL. Se o lock tiver
   * expirado e sido adquirido por outra instância, retorna false sem
   * alterar o estado do Redis.
   *
   * @param key    - A mesma chave usada no acquire
   * @param token  - O token retornado pelo acquire
   * @param ttlMs  - Novo TTL a partir de agora, em ms
   * @returns true se o lock ainda pertence a esta instância e foi renovado,
   *          false se o lock expirou ou foi assumido por outra instância.
   */
  static async renew(key, token, ttlMs) {
    const redisCache = getLockRedis();
    try {
      const result = await redisCache.renewLock(key, token, String(ttlMs));
      const renewed = result === 1;
      if (!renewed) {
        collectMetricsLockExpired?.inc({ key });
        logger.warn({ key }, LOCK_LOGS.RENEW_EXPIRED);
      }
      return renewed;
    } catch (error) {
      collectMetricsLockErrors?.inc({ operation: "renew" });
      logger.error({ error, key }, LOCK_LOGS.RENEW_FAILED);
      return false;
    }
  }
  /**
   * Libera o lock manualmente ao fim do trabalho.
   *
   * Usa um script Lua para garantir atomicidade entre a verificação do
   * owner e a deleção da chave. Se o lock já expirou e foi adquirido por
   * outra instância, o DEL não ocorre — protegendo o lock alheio.
   *
   * @param key   - A mesma chave usada no acquire
   * @param token - O token retornado pelo acquire
   */
  static async release(key, token) {
    const redisCache = getLockRedis();
    try {
      const result = await redisCache.releaseLock(key, token);
      recordReleaseOutcome(key, result === 0);
    } catch (error) {
      collectMetricsLockErrors?.inc({ operation: "release" });
      logger.warn({ error, key }, LOCK_LOGS.RELEASE_FAILED);
    } finally {
      observeHoldDuration(key, token);
    }
  }
};
function recordAcquisition(key, token) {
  collectMetricsLockAcquired?.inc({ key });
  if (collectMetricsLockDuration) {
    lockHoldStart.set(token, Date.now());
  }
}
function recordReleaseOutcome(key, alreadyExpired) {
  if (alreadyExpired) {
    collectMetricsLockExpired?.inc({ key });
    logger.warn({ key }, LOCK_LOGS.RELEASE_EXPIRED);
    return;
  }
  collectMetricsLockReleased?.inc({ key });
}
function observeHoldDuration(key, token) {
  if (!collectMetricsLockDuration) {
    return;
  }
  const start = lockHoldStart.get(token);
  if (start !== void 0) {
    collectMetricsLockDuration.observe({ key }, (Date.now() - start) / 1e3);
  }
  lockHoldStart.delete(token);
}

// src/lib/infra/distributed-lock/with-distributed-lock.ts
async function withDistributedLock(params) {
  const { lockKey, ttlMs, errorMessage, skippedMessage, work } = params;
  let lockToken = null;
  try {
    lockToken = await DistributedLock.acquire(lockKey, ttlMs);
    if (!lockToken) {
      if (skippedMessage) logger.warn(skippedMessage);
      return;
    }
    const token = lockToken;
    await work(async () => {
      await DistributedLock.renew(lockKey, token, ttlMs);
    });
  } catch (error) {
    logger.error({ error }, errorMessage);
    captureError(error);
  } finally {
    if (lockToken) {
      await DistributedLock.release(lockKey, lockToken);
    }
  }
}

// src/core/shared/result.ts
var ok = (value) => ({
  success: true,
  value
});
var err = (error) => ({
  success: false,
  error
});
function isErr(result) {
  return !result.success;
}

// src/lib/infra/jobs/outbox-processor.ts
var OutboxProcessor = class {
  constructor(outboxRepository, dispatchRegistry) {
    this.outboxRepository = outboxRepository;
    this.dispatchRegistry = dispatchRegistry;
  }
  outboxRepository;
  dispatchRegistry;
  LOCK_KEY = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR;
  LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT;
  async processPendingEvents() {
    await withDistributedLock({
      lockKey: this.LOCK_KEY,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.CRITICAL_LOOP_ERROR,
      skippedMessage: OUTBOX_LOGS.SKIPPED_ANOTHER_RUNNING,
      work: async (renew) => {
        const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_CONSTANTS.THRESHOLDS.PENDING_FETCH_LIMIT);
        if (isErr(pendingEventsResult)) {
          logger.error({ error: pendingEventsResult.error }, OUTBOX_LOGS.PENDING_FETCH_ERROR);
          captureError(pendingEventsResult.error);
          return;
        }
        const pendingEvents = pendingEventsResult.value;
        if (pendingEvents.length === 0) return;
        logger.info(`Processando ${pendingEvents.length} eventos pendentes da Outbox...`);
        for (const event of pendingEvents) {
          await renew();
          await this.processSingleEvent(event);
        }
      }
    });
  }
  async processStuckSendingEvents() {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR,
      work: async (renew) => {
        const thresholdDate = new Date(Date.now() - OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS);
        const stuckEventsResult = await this.outboxRepository.findStuck(
          thresholdDate,
          OUTBOX_CONSTANTS.THRESHOLDS.STUCK_FETCH_LIMIT
        );
        if (isErr(stuckEventsResult)) {
          logger.error({ error: stuckEventsResult.error }, OUTBOX_LOGS.STUCK_FETCH_ERROR);
          captureError(stuckEventsResult.error);
          return;
        }
        const stuckEvents = stuckEventsResult.value;
        if (stuckEvents.length === 0) return;
        logger.warn(`Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recupera\xE7\xE3o...`);
        for (const event of stuckEvents) {
          await renew();
          collectMetricsOutboxEventsStuckSendingEventsRecovered?.inc();
          await this.processSingleEvent(event, thresholdDate);
        }
      }
    });
  }
  async processSingleEvent(event, stuckBefore) {
    if (isExpired(event)) {
      await this.discardExpired(event);
      return;
    }
    if (event.attempts >= OUTBOX_CONSTANTS.THRESHOLDS.MAX_DISPATCH_ATTEMPTS) {
      await this.markPoisoned(event);
      return;
    }
    const claimResult = await this.outboxRepository.claim({
      publicId: event.publicId,
      fromStatus: event.status,
      stuckBefore
    });
    if (isErr(claimResult)) {
      logger.error({ publicId: event.publicId, error: claimResult.error }, OUTBOX_LOGS.STATUS_UPDATE_FAILED);
      return;
    }
    if (!claimResult.value) {
      this.recordClaimMetric("contention");
      logger.info({ publicId: event.publicId }, "Evento n\xE3o reivindicado (j\xE1 em processamento ou em disputa). Pulando.");
      return;
    }
    this.recordClaimMetric("claimed");
    await this.dispatchOrRevert(event);
  }
  recordClaimMetric(outcome) {
    collectMetricsOutboxEventsClaimed?.inc({ outcome });
  }
  /**
   * Gate de expiração — ANTES de qualquer fase: um evento expirado sai da tabela
   * em vez de virar FAILED. O payload carrega um segredo e a linha é lixo em
   * qualquer status.
   */
  async discardExpired(event) {
    const deleteResult = await this.outboxRepository.delete(event.publicId);
    if (isErr(deleteResult)) {
      logger.error({ publicId: event.publicId, error: deleteResult.error }, OUTBOX_LOGS.EXPIRED_EVENT_DELETE_ERROR);
      captureError(deleteResult.error, { publicId: event.publicId });
      return;
    }
    collectMetricsOutboxEventsExpired?.inc();
    logger.info({ publicId: event.publicId, type: event.type }, OUTBOX_LOGS.EXPIRED_EVENT_DELETED);
  }
  /** Phase 0: excedeu o limite de ciclos de despacho — terminal (poison message). */
  async markPoisoned(event) {
    const failResult = await this.outboxRepository.updateStatus(event.publicId, "FAILED" /* FAILED */);
    if (isErr(failResult)) {
      logger.error({ publicId: event.publicId, error: failResult.error }, OUTBOX_LOGS.FAILED_MARK_ERROR);
      captureError(failResult.error, { publicId: event.publicId });
      return;
    }
    collectMetricsOutboxEventsMarkedAsTerminalFail?.inc();
    logger.warn({ publicId: event.publicId, attempts: event.attempts }, OUTBOX_LOGS.MARKED_FAILED);
    captureError(new Error(OUTBOX_LOGS.MARKED_FAILED), { publicId: event.publicId, attempts: event.attempts });
  }
  /** Phase 2: despacha ao BullMQ, revertendo para PENDING se o despacho falhar. */
  async dispatchOrRevert(event) {
    try {
      await this.dispatchToBullMQ(event);
      collectMetricsOutboxEventsDispatched?.inc();
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, "PENDING" /* PENDING */);
      if (isErr(revertResult)) {
        collectMetricsOutboxEventsRevertFailed?.inc();
        logger.error({ publicId: event.publicId, error: revertResult.error }, OUTBOX_LOGS.REVERT_FATAL);
        captureError(revertResult.error, { publicId: event.publicId });
        return;
      }
      collectMetricsOutboxEventsReverted?.inc();
      logger.error({ publicId: event.publicId, error }, OUTBOX_LOGS.DISPATCH_REVERTED);
    }
  }
  async dispatchToBullMQ(event) {
    const strategyResult = this.dispatchRegistry.resolve(event.type);
    if (isErr(strategyResult)) {
      throw strategyResult.error;
    }
    const planResult = await strategyResult.value.buildDispatch(event);
    if (isErr(planResult)) {
      throw planResult.error;
    }
    const { emails, jobOptions } = planResult.value;
    let finalEmails = emails;
    if (event.pendingRecipients.length > 0) {
      const filtered = emails.filter((e) => event.pendingRecipients.includes(e.to));
      if (filtered.length === 0) {
        logger.warn({ publicId: event.publicId }, OUTBOX_LOGS.PENDING_RECIPIENTS_UNRESOLVED);
      } else {
        finalEmails = filtered;
      }
    }
    await getMailQueue().add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: finalEmails,
        // Repassa a expiração para o gate do mail worker (job data é JSON)
        ...event.expiresAt ? { expiresAt: new Date(event.expiresAt).toISOString() } : {}
      },
      { jobId: event.publicId, ...jobOptions }
    );
  }
};
function isExpired(event) {
  return Boolean(event.expiresAt) && new Date(event.expiresAt).getTime() <= Date.now();
}

// src/lib/infra/jobs/outbox-maintenance.ts
var import_ms2 = __toESM(require("ms"));
var OutboxMaintenance = class {
  constructor(outboxRepository) {
    this.outboxRepository = outboxRepository;
  }
  outboxRepository;
  LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT;
  async sweepExpiredEvents() {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_EXPIRY_SWEEP,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.EXPIRY_SWEEP_ERROR,
      work: async (renew) => {
        const totalDeleted = await this.deleteExpiredInBatches(/* @__PURE__ */ new Date(), renew);
        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: "expiry_sweep" }, totalDeleted);
          logger.info({ deleted: totalDeleted }, OUTBOX_LOGS.EXPIRY_SWEEP_DELETED);
        }
      }
    });
  }
  async purgeOldEvents() {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RETENTION,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.RETENTION_ERROR,
      work: async (renew) => {
        const cutoff = new Date(Date.now() - (0, import_ms2.default)(`${OUTBOX_CONSTANTS.RETENTION.DAYS}d`));
        const { totalDeleted, totalByStatus } = await this.deleteOlderThanInBatches(cutoff, renew);
        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: "retention_purge" }, totalDeleted);
          reportPurge(totalDeleted, totalByStatus);
        }
      }
    });
  }
  async purgeFailedEvents(customCutoff) {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_FAILED_PURGE,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.FAILED_PURGE_ERROR,
      work: async (renew) => {
        const cutoff = customCutoff ?? new Date(Date.now() - (0, import_ms2.default)(`${OUTBOX_CONSTANTS.RETENTION.FAILED_DAYS}d`));
        const totalDeleted = await this.deleteFailedOlderThanInBatches(cutoff, renew);
        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: "failed_purge" }, totalDeleted);
          logger.info({ deleted: totalDeleted }, OUTBOX_LOGS.FAILED_PURGED);
        }
      }
    });
  }
  /** Um lote por iteração, renovando o lock entre lotes. */
  async deleteExpiredInBatches(now, renew) {
    let totalDeleted = 0;
    let lastBatchSize = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE;
    while (lastBatchSize === OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) {
      await renew();
      const result = await this.outboxRepository.deleteExpired(now, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE);
      if (isErr(result)) {
        logger.error({ error: result.error }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR);
        captureError(result.error);
        return totalDeleted;
      }
      lastBatchSize = result.value;
      totalDeleted += lastBatchSize;
    }
    return totalDeleted;
  }
  async deleteOlderThanInBatches(cutoff, renew) {
    let totalDeleted = 0;
    const totalByStatus = {};
    let lastBatchSize = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE;
    while (lastBatchSize === OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) {
      await renew();
      const batchResult = await this.outboxRepository.deleteOlderThan(cutoff, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE);
      if (isErr(batchResult)) {
        logger.error({ error: batchResult.error }, OUTBOX_LOGS.RETENTION_ERROR);
        captureError(batchResult.error);
        return { totalDeleted, totalByStatus };
      }
      const { deleted, byStatus } = batchResult.value;
      lastBatchSize = deleted;
      totalDeleted += deleted;
      for (const [status, count] of Object.entries(byStatus)) {
        totalByStatus[status] = (totalByStatus[status] ?? 0) + count;
      }
    }
    return { totalDeleted, totalByStatus };
  }
  async deleteFailedOlderThanInBatches(cutoff, renew) {
    let totalDeleted = 0;
    let lastBatchSize = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE;
    while (lastBatchSize === OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) {
      await renew();
      const result = await this.outboxRepository.deleteFailedOlderThan(cutoff, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE);
      if (isErr(result)) {
        logger.error({ error: result.error }, OUTBOX_LOGS.FAILED_PURGE_ERROR);
        captureError(result.error);
        return totalDeleted;
      }
      lastBatchSize = result.value;
      totalDeleted += lastBatchSize;
    }
    return totalDeleted;
  }
};
function reportPurge(totalDeleted, totalByStatus) {
  const nonTerminal = (totalByStatus["PENDING" /* PENDING */] ?? 0) + (totalByStatus["SENDING" /* SENDING */] ?? 0);
  if (nonTerminal > 0) {
    logger.warn({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED_NON_TERMINAL);
    return;
  }
  logger.info({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED);
}

// src/lib/metrics/analytics-metrics.ts
var import_prom_client4 = require("prom-client");
var registry4 = getRegistry();
var collectMetricsAnalyticsRetentionDeleted = registry4 ? new import_prom_client4.Counter({
  name: "analytics_retention_deleted_total",
  help: "Analytics rows deleted by the retention sweep",
  labelNames: ["table"],
  registers: [registry4]
}) : null;
var collectMetricsAnalyticsRetentionRuns = registry4 ? new import_prom_client4.Counter({
  name: "analytics_retention_runs_total",
  help: "Analytics retention sweep executions",
  registers: [registry4]
}) : null;
var collectMetricsAnalyticsCookieSupersededSecret = registry4 ? new import_prom_client4.Counter({
  name: "analytics_cookie_superseded_secret_total",
  help: "Signed analytics cookies presented that verified against a rotated-out secret",
  labelNames: ["cookie"],
  registers: [registry4]
}) : null;

// src/lib/infra/jobs/analytics-retention.ts
var import_ms3 = __toESM(require("ms"));
var AnalyticsRetention = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  analyticsRepository;
  LOCK_TTL_MS = ANALYTICS_CONSTANTS.LOCK_TTL_MS.DEFAULT;
  async purgeExpiredData() {
    await withDistributedLock({
      lockKey: ANALYTICS_CONSTANTS.LOCK_KEYS.ANALYTICS_RETENTION,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: ANALYTICS_LOGS.RETENTION_ERROR,
      work: async (renew) => {
        collectMetricsAnalyticsRetentionRuns?.inc();
        const deleted = {};
        for (const target of this.targets()) {
          deleted[target.table] = await this.purgeInBatches(target, renew);
        }
        logger.info({ deleted }, ANALYTICS_LOGS.RETENTION_DONE);
      }
    });
  }
  targets() {
    return [
      {
        table: "analytics_events",
        days: env.ANALYTICS_RETENTION_EVENTS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeEventsOlderThan(cutoff, size)
      },
      {
        table: "analytics_sessions",
        days: env.ANALYTICS_RETENTION_SESSIONS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeSessionsOlderThan(cutoff, size)
      },
      {
        table: "analytics_visitors",
        days: env.ANALYTICS_RETENTION_VISITORS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeVisitorsInactiveSince(cutoff, size)
      }
    ];
  }
  /**
   * Loops one bounded batch at a time, renewing the lock between them, until a
   * pass deletes nothing or the per-run ceiling is reached.
   *
   * A repository failure ENDS this target and leaves the rest of the sweep to
   * run. Retention is not transactional and does not need to be: whatever was
   * not deleted tonight is deleted tomorrow, and aborting the whole sweep
   * because one table erred would let the other two grow unbounded.
   */
  async purgeInBatches(target, renew) {
    const cutoff = new Date(Date.now() - (0, import_ms3.default)(`${target.days}d`));
    let totalDeleted = 0;
    for (let batch = 0; batch < ANALYTICS_CONSTANTS.RETENTION.MAX_BATCHES_PER_RUN; batch++) {
      const deleted = await this.purgeOneBatch(target, cutoff);
      if (deleted === 0) {
        break;
      }
      totalDeleted += deleted;
      collectMetricsAnalyticsRetentionDeleted?.inc({ table: target.table }, deleted);
      await renew();
    }
    return totalDeleted;
  }
  /**
   * One batch, reporting a failure as zero deletions.
   *
   * Collapsing "errored" into "nothing more to do" is deliberate: retention is
   * not transactional, and the correct response to either is to move on. What
   * must NOT be collapsed is the logging — a failure is recorded with the table
   * that produced it, so a table that quietly stops draining is visible.
   */
  async purgeOneBatch(target, cutoff) {
    const result = await target.purge(cutoff, ANALYTICS_CONSTANTS.RETENTION.BATCH_SIZE);
    if (isErr(result)) {
      logger.error({ error: result.error, table: target.table }, ANALYTICS_LOGS.RETENTION_ERROR);
      return 0;
    }
    return result.value;
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

// src/core/types/outbox/outbox-event-input.ts
var OUTBOX_EVENT_TYPES = {
  FORM_SUBMISSION_CREATED: "FormSubmissionCreated",
  // The name of an outbox EVENT TYPE, not a credential — the heuristic pairs
  // the word "password" with a string literal on the same line. The real reset
  // token lives only in the transient payload below.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  PASSWORD_RESET_REQUESTED: "PasswordResetRequested"
};

// src/templates/contact-user/contact-user-subject-text.ts
function contactUserSubjectTextTemplate(name) {
  return `
            Gra\xE7a e paz, ${name}. Ficamos felizes com o seu contato!
        `;
}

// src/templates/contact-user/contact-user-text.ts
function contactUserTextTemplate(name) {
  return `
            Gra\xE7a e paz, ${name}! 
            Recebemos sua mensagem. \xC9 uma honra que voc\xEA esteja se conectando conosco!
            Voc\xEA ser\xE1 adicionado \xE0 nossa lista de e-mails para receber atualiza\xE7\xF5es, 
            recursos e inspira\xE7\xE3o para lhe auxiliar na sua jornada.
        `;
}

// src/templates/react/contact-user.tsx
var import_components2 = require("@react-email/components");

// src/templates/react/layout.tsx
var import_components = require("@react-email/components");
var import_jsx_runtime = require("react/jsx-runtime");
function EmailLayout({ headerTitle, children, footerContent }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Html, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_components.Tailwind, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Head, {}),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Body, { className: "bg-gray-100 font-sans", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_components.Container, { className: "bg-white mx-auto my-[40px] shadow-sm rounded-lg overflow-hidden w-full max-w-[600px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { className: "bg-[#eb5933] p-[20px] text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Text, { className: "text-white text-[24px] font-bold m-0", children: headerTitle }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { className: "p-[30px]", children }),
      footerContent && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_components.Section, { className: "bg-gray-50 border-t border-gray-200 p-[20px] text-center", children: footerContent })
    ] }) })
  ] }) });
}

// src/templates/react/contact-user.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function ContactUserEmail({ name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    EmailLayout,
    {
      headerTitle: "Evangelismo Digital",
      footerContent: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_components2.Text, { className: "text-[12px] text-gray-500 m-0", children: [
        "Se deseja n\xE3o receber mais estes e-mails,",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_components2.Link, { href: "#", className: "text-gray-500 underline", children: "clique aqui" }),
        "."
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_components2.Section, { className: "text-center text-gray-700 text-[16px]", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_components2.Text, { className: "text-[20px] font-semibold mb-[20px]", children: [
          "Gra\xE7a e paz, ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: name }),
          "!"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_components2.Text, { className: "mb-[15px]", children: "Recebemos sua mensagem. \xC9 uma honra que voc\xEA esteja se conectando conosco!" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_components2.Text, { className: "m-0", children: "Voc\xEA ser\xE1 adicionado \xE0 nossa lista de e-mails para receber atualiza\xE7\xF5es, recursos e inspira\xE7\xE3o para lhe auxiliar na sua jornada." })
      ] })
    }
  );
}

// src/templates/contact-staff/contact-staff-subject-text.ts
function contactStaffSubjectTextTemplate() {
  return `
            Novo formul\xE1rio enviado
        `;
}

// src/templates/contact-staff/contact-staff-text.ts
function contactStaffTextTemplate(name, email, ipAddress) {
  const ipSection = ipAddress ? `
IP de origem: ${ipAddress}` : "";
  return `
            ${name} <${email}> enviou um formul\xE1rio.${ipSection}
        `;
}

// src/templates/react/contact-staff.tsx
var import_components3 = require("@react-email/components");
var import_jsx_runtime3 = require("react/jsx-runtime");
function ContactStaffEmail({ name, lastName, email, ipAddress }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(EmailLayout, { headerTitle: "Boas not\xEDcias!", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_components3.Heading, { className: "text-[20px] font-semibold text-gray-800 text-center mb-[20px]", children: "Um novo formul\xE1rio acaba de ser enviado!" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_components3.Section, { className: "text-[16px] text-gray-700 space-y-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_components3.Text, { className: "m-0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "Nome:" }),
        " ",
        name,
        " ",
        lastName
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_components3.Text, { className: "m-0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "Email:" }),
        " ",
        email
      ] }),
      ipAddress && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_components3.Text, { className: "m-0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "IP de origem:" }),
        " ",
        ipAddress
      ] })
    ] })
  ] });
}

// src/errors/domain-error.ts
var DomainError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type, failureMode, telemetryReason) {
    super(detail, type, failureMode, telemetryReason);
  }
};

// src/messages/errors/forms.ts
var INVALID_FORM_PAYLOAD_ERROR_FN = (fieldName) => ({
  code: "INVALID_FORM_PAYLOAD",
  message: fieldName ? `Payload do formul\xE1rio inv\xE1lido: campo '${fieldName}' possui valor inesperado.` : "Payload do formul\xE1rio inv\xE1lido: um ou mais campos possuem valores inesperados."
});

// src/use-cases/errors/forms/invalid-form-payload-error.ts
var InvalidFormPayloadError = class extends DomainError {
  constructor(fieldName) {
    super(INVALID_FORM_PAYLOAD_ERROR_FN(fieldName), "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/forms/strategies/form-payload-fields.ts
function requireStringField(value, fieldName) {
  if (typeof value === "string") {
    return ok(value);
  }
  return err(new InvalidFormPayloadError(fieldName));
}
function optionalStringField(value, fieldName) {
  if (value === void 0 || typeof value === "string") {
    return ok(value || "");
  }
  return err(new InvalidFormPayloadError(fieldName));
}
function optionalIpAddress(form) {
  return typeof form.ipAddress === "string" ? form.ipAddress : void 0;
}
function requireSubmitterIdentity(form) {
  const emailResult = requireStringField(form.email, "form.email");
  if (isErr(emailResult)) return emailResult;
  const nameResult = requireStringField(form.name, "form.name");
  if (isErr(nameResult)) return nameResult;
  return ok({ email: emailResult.value, name: nameResult.value });
}
async function buildUserMailJob(form, buildContent) {
  const identityResult = requireSubmitterIdentity(form);
  if (isErr(identityResult)) return identityResult;
  const { email, name } = identityResult.value;
  const { type, subject, message, html } = await buildContent({ email, name });
  return ok({
    subject,
    message,
    html,
    to: email,
    context: { type, recipient: "user" }
  });
}
function buildStaffMailJob(content) {
  return {
    to: env.ADMIN_EMAIL,
    subject: content.subject,
    message: content.message,
    html: content.html,
    context: { type: content.type, recipient: "internal" }
  };
}
function extractContactStaffData(form) {
  const identityResult = requireSubmitterIdentity(form);
  if (isErr(identityResult)) return identityResult;
  const lastNameResult = optionalStringField(form.lastName, "form.lastName");
  if (isErr(lastNameResult)) return lastNameResult;
  return ok({
    ...identityResult.value,
    lastName: lastNameResult.value,
    ipAddress: optionalIpAddress(form)
  });
}

// src/use-cases/forms/strategies/contact-email-strategy.ts
var import_render = require("@react-email/render");
var import_react = __toESM(require("react"));
var ContactEmailStrategy = class {
  async buildUserEmail(form) {
    return buildUserMailJob(form, async ({ name }) => ({
      type: "contact",
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: await (0, import_render.render)(import_react.default.createElement(ContactUserEmail, { name }))
    }));
  }
  async buildStaffEmail(form) {
    const dataResult = extractContactStaffData(form);
    if (isErr(dataResult)) return dataResult;
    const { email, name, lastName, ipAddress } = dataResult.value;
    return ok(
      buildStaffMailJob({
        type: "contact",
        subject: contactStaffSubjectTextTemplate(),
        message: contactStaffTextTemplate(name, email, ipAddress),
        html: await (0, import_render.render)(import_react.default.createElement(ContactStaffEmail, { name, lastName, email, ipAddress }))
      })
    );
  }
};

// src/templates/decision-for-christ-user/decision-for-christ-user-subject-text.ts
function decisionForChristUserSubjectText() {
  return `
        Parab\xE9ns pela sua decis\xE3o por Cristo!
    `;
}

// src/templates/decision-for-christ-user/decision-for-christ-user-text.ts
function decisionForChristUserTextTemplate(name) {
  return `
        Ol\xE1 ${name}, 
        \xC9 uma alegria saber que voc\xEA tomou uma decis\xE3o por Cristo.
        Em breve, nossa equipe entrar\xE1 em contato para acompanh\xE1-lo nessa nova jornada.
    `;
}

// src/templates/react/decision-for-christ-user.tsx
var import_components4 = require("@react-email/components");
var import_jsx_runtime4 = require("react/jsx-runtime");
function DecisionForChristUserEmail({ name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EmailLayout, { headerTitle: "Evangelismo Digital", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_components4.Section, { className: "text-gray-700 text-[16px]", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_components4.Text, { className: "mb-[15px]", children: [
      "Ol\xE1 ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: name }),
      ","
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_components4.Text, { className: "mb-[15px]", children: "\xC9 uma alegria saber que voc\xEA tomou uma decis\xE3o por Cristo." }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_components4.Text, { className: "m-0", children: "Em breve, nossa equipe entrar\xE1 em contato para acompanh\xE1-lo nessa nova jornada." })
  ] }) });
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-subject-text.ts
function decisionForChristStaffSubjectText() {
  return `
      Nova decis\xE3o por Cristo registrada
    `;
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-text.ts
function decisionForChristStaffTextTemplate(name, email, ipAddress) {
  const ipSection = ipAddress ? `
IP de origem: ${ipAddress}` : "";
  return `
            ${name} <${email}> aceitou a Cristo.${ipSection}
        `;
}

// src/templates/react/decision-for-christ-staff.tsx
var import_components5 = require("@react-email/components");
var import_jsx_runtime5 = require("react/jsx-runtime");
function DecisionForChristStaffEmail({
  name,
  lastName,
  email,
  location,
  ipAddress
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmailLayout, { headerTitle: "Nova Decis\xE3o por Cristo!", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_components5.Section, { className: "text-gray-700 text-[16px]", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_components5.Text, { className: "font-semibold text-[18px] mb-[15px]", children: "Algu\xE9m tomou uma decis\xE3o por Cristo:" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("ul", { className: "list-disc list-inside space-y-2 mt-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "Nome:" }),
        " ",
        name,
        " ",
        lastName
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "Email:" }),
        " ",
        email
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "Local:" }),
        " ",
        location ?? "n\xE3o informado"
      ] }),
      ipAddress && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "IP de origem:" }),
        " ",
        ipAddress
      ] })
    ] })
  ] }) });
}

// src/use-cases/forms/strategies/decision-for-christ-email-strategy.ts
var import_render2 = require("@react-email/render");
var import_react2 = __toESM(require("react"));
var DecisionForChristEmailStrategy = class {
  async buildUserEmail(form) {
    return buildUserMailJob(form, async ({ name }) => ({
      type: "decision-for-Christ",
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: await (0, import_render2.render)(import_react2.default.createElement(DecisionForChristUserEmail, { name }))
    }));
  }
  async buildStaffEmail(form) {
    const identityResult = requireSubmitterIdentity(form);
    if (isErr(identityResult)) return identityResult;
    const lastNameResult = requireStringField(form.lastName, "form.lastName");
    if (isErr(lastNameResult)) return lastNameResult;
    const locationResult = optionalStringField(form.location, "form.location");
    if (isErr(locationResult)) return locationResult;
    const { email, name } = identityResult.value;
    const lastName = lastNameResult.value;
    const location = locationResult.value;
    const ipAddress = optionalIpAddress(form);
    return ok(
      buildStaffMailJob({
        type: "decision-for-Christ",
        subject: decisionForChristStaffSubjectText(),
        message: decisionForChristStaffTextTemplate(name, email, ipAddress),
        html: await (0, import_render2.render)(
          import_react2.default.createElement(DecisionForChristStaffEmail, { name, lastName, email, location, ipAddress })
        )
      })
    );
  }
};

// src/use-cases/forms/strategies/form-submission-dispatch-strategy.ts
var FormSubmissionDispatchStrategy = class {
  async buildDispatch(event) {
    const payload = event.payload;
    const strategy = payload.decisaoPorCristo ? new DecisionForChristEmailStrategy() : new ContactEmailStrategy();
    const userJobResult = await strategy.buildUserEmail(payload);
    if (isErr(userJobResult)) {
      return userJobResult;
    }
    const staffJobResult = await strategy.buildStaffEmail(payload);
    if (isErr(staffJobResult)) {
      return staffJobResult;
    }
    return ok({ emails: [userJobResult.value, staffJobResult.value] });
  }
};

// src/messages/errors/password-reset.ts
var INVALID_PASSWORD_RESET_PAYLOAD_ERROR_FN = (fieldName) => ({
  code: "INVALID_PASSWORD_RESET_PAYLOAD",
  message: fieldName ? `Payload de reset de senha inv\xE1lido: campo '${fieldName}' possui valor inesperado.` : "Payload de reset de senha inv\xE1lido: um ou mais campos possuem valores inesperados."
});

// src/use-cases/errors/invalid-password-reset-payload-error.ts
var InvalidPasswordResetPayloadError = class extends DomainError {
  constructor(fieldName) {
    super(INVALID_PASSWORD_RESET_PAYLOAD_ERROR_FN(fieldName), "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/messages/constants/email/email.ts
var EMAIL_CONSTANTS = {
  PASSWORD_RECOVERY_SUBJECT: "Recupera\xE7\xE3o de senha",
  PASSWORD_RESET_GENERIC_MESSAGE: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
};
var EMAIL_LOGS = {
  SMTP_VERIFIED: "transportador SMTP verificado com sucesso",
  SMTP_VERIFY_FAILED: "transportador SMTP falhou na verifica\xE7\xE3o",
  SMTP_CIRCUIT_OPENED: "Circuito do SMTP aberto ap\xF3s falhas consecutivas; envios falhar\xE3o r\xE1pido e o transportador ser\xE1 recriado."
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

// src/templates/forgot-password/forgot-password-text.ts
function forgotPasswordTextTemplate(userName, token) {
  const url = `${env.FRONTEND_URL}/reset-password/${token}`;
  const appName = env.APP_NAME;
  return `
Ol\xE1, ${userName}!

Recebemos uma solicita\xE7\xE3o para redefinir a sua senha. Para continuar, acesse o link abaixo:

${url}

Este link \xE9 v\xE1lido por ${PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES} minutos.

Se voc\xEA n\xE3o solicitou a recupera\xE7\xE3o de senha, ignore este e-mail.

Atenciosamente,
Equipe ${appName}
  `.trim();
}

// src/templates/react/forgot-password.tsx
var import_components6 = require("@react-email/components");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ForgotPasswordEmail({
  userName,
  resetUrl,
  appName,
  expiresInMinutes
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(EmailLayout, { headerTitle: "Recupera\xE7\xE3o de Senha", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_components6.Section, { className: "text-gray-700 text-[16px]", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_components6.Heading, { className: "text-[20px] font-semibold mb-[20px] m-0", children: [
      "Ol\xE1, ",
      userName,
      "!"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_components6.Text, { className: "mb-[20px]", children: "Recebemos uma solicita\xE7\xE3o para redefinir a sua senha. Para continuar, clique no bot\xE3o abaixo:" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_components6.Section, { className: "text-center mb-[20px]", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_components6.Button,
      {
        href: resetUrl,
        className: "bg-[#1976d2] text-white px-[24px] py-[12px] rounded-[6px] font-bold decoration-none",
        children: "Redefinir senha"
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_components6.Text, { className: "mb-[20px]", children: [
      "Ou copie e cole este link no seu navegador: ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("br", {}),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_components6.Link, { href: resetUrl, className: "text-[#1976d2] underline break-all", children: resetUrl })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_components6.Text, { className: "mb-[20px]", children: [
      "Este link \xE9 v\xE1lido por ",
      expiresInMinutes,
      " minutos."
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_components6.Text, { className: "mb-[20px]", children: "Se voc\xEA n\xE3o solicitou a recupera\xE7\xE3o de senha, ignore este e-mail." }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_components6.Text, { className: "m-0", children: [
      "Atenciosamente, ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("br", {}),
      "Equipe ",
      appName
    ] })
  ] }) });
}

// src/use-cases/users/strategies/password-reset-dispatch-strategy.ts
var import_render3 = require("@react-email/render");
var import_react3 = __toESM(require("react"));
var PasswordResetDispatchStrategy = class {
  async buildDispatch(event) {
    const payloadResult = this.parsePayload(event.payload);
    if (isErr(payloadResult)) return payloadResult;
    const { name, email, token } = payloadResult.value;
    const url = `${env.FRONTEND_URL}/reset-password/${token}`;
    const html = await (0, import_render3.render)(
      import_react3.default.createElement(ForgotPasswordEmail, {
        userName: name,
        resetUrl: url,
        appName: env.APP_NAME,
        expiresInMinutes: PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES
      })
    );
    return ok({
      emails: [
        {
          to: email,
          subject: EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT,
          message: forgotPasswordTextTemplate(name, token),
          context: { type: "password-reset", recipient: "user" },
          html
        }
      ],
      jobOptions: {
        attempts: PASSWORD_RESET_CONSTANTS.JOB_ATTEMPTS,
        backoff: { type: "fixed", delay: PASSWORD_RESET_CONSTANTS.JOB_BACKOFF_DELAY_MS }
      }
    });
  }
  parsePayload(payload) {
    const name = this.getStringField(payload.name, "payload.name");
    if (isErr(name)) return name;
    const email = this.getStringField(payload.email, "payload.email");
    if (isErr(email)) return email;
    const token = this.getStringField(payload.token, "payload.token");
    if (isErr(token)) return token;
    return ok({ name: name.value, email: email.value, token: token.value });
  }
  getStringField(value, fieldName) {
    if (typeof value === "string" && value.length > 0) {
      return ok(value);
    }
    return err(new InvalidPasswordResetPayloadError(fieldName));
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
var UNKNOWN_OUTBOX_EVENT_TYPE_ERROR_FN = (eventType) => ({
  code: "UNKNOWN_OUTBOX_EVENT_TYPE",
  message: `Nenhuma estrat\xE9gia de despacho registrada para o tipo de evento '${eventType}'.`
});

// src/lib/errors/outbox/unknown-outbox-event-type-error.ts
var UnknownOutboxEventTypeError = class extends InfrastructureError {
  constructor(eventType) {
    super(UNKNOWN_OUTBOX_EVENT_TYPE_ERROR_FN(eventType));
  }
};

// src/lib/infra/jobs/outbox-dispatch-strategy-registry.ts
var OutboxDispatchStrategyRegistry = class {
  strategies;
  constructor(entries) {
    this.strategies = new Map(entries);
  }
  resolve(eventType) {
    const strategy = this.strategies.get(eventType);
    if (!strategy) {
      return err(new UnknownOutboxEventTypeError(eventType));
    }
    return ok(strategy);
  }
};

// src/lib/infra/jobs/make-outbox-dispatch-registry.ts
function makeOutboxDispatchStrategyRegistry() {
  return new OutboxDispatchStrategyRegistry([
    [OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED, new FormSubmissionDispatchStrategy()],
    [OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED, new PasswordResetDispatchStrategy()]
  ]);
}

// src/messages/errors/system.ts
var SYSTEM_ERRORS = {
  ASYNC_LOCAL_STORAGE_NOT_INITIALIZED: {
    code: "ASYNC_LOCAL_STORAGE_NOT_INITIALIZED",
    message: "Async Local Storage is not initialized."
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

// src/lib/workers/mail-worker.ts
var import_bullmq4 = require("bullmq");

// src/messages/errors/queue.ts
var QUEUE_ERRORS = {
  JOB_ALREADY_PROCESSING: {
    code: "JOB_ALREADY_PROCESSING",
    message: "Bloqueio de Idempot\xEAncia: Job em processamento simult\xE2neo por outra thread."
  },
  SMTP_DISPATCH_FAILED: {
    code: "SMTP_DISPATCH_FAILED",
    message: "Falha cr\xEDtica ao despachar os e-mails via servidor SMTP."
  }
};

// src/lib/errors/queue/smtp-dispatch-error.ts
var SmtpDispatchError = class extends InfrastructureError {
  constructor(originalError) {
    super(QUEUE_ERRORS.SMTP_DISPATCH_FAILED, originalError);
  }
};

// src/use-cases/email/send-email.ts
var SendEmailUseCase = class {
  constructor(mailSender2) {
    this.mailSender = mailSender2;
  }
  mailSender;
  async execute({
    to,
    subject,
    message,
    html,
    attachments
  }) {
    try {
      const info = await this.mailSender.send({ to, subject, message, html, attachments });
      return ok(info);
    } catch (error) {
      return err(new SmtpDispatchError(error));
    }
  }
};

// src/lib/mail/nodemailer-mail-sender.ts
var import_nodemailer = __toESM(require("nodemailer"));
var import_cockatiel = require("cockatiel");
var NodemailerMailSender = class {
  transporter = null;
  breaker = createSmtpBreaker();
  constructor() {
    this.breaker?.onBreak(() => {
      logger.warn(EMAIL_LOGS.SMTP_CIRCUIT_OPENED);
      this.transporter = null;
    });
  }
  async getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }
    const transporter = import_nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_EMAIL,
        pass: env.SMTP_PASSWORD
      },
      // Pooling: o worker manda em lote, e abrir uma conexão por mensagem é o
      // que torna um lote lento o bastante para estourar o lock do job. Os
      // limites vêm do env porque são cota do provedor, não constante de código.
      pool: true,
      maxConnections: env.SMTP_POOL_MAX_CONNECTIONS,
      maxMessages: env.SMTP_POOL_MAX_MESSAGES,
      rateDelta: env.SMTP_POOL_RATE_DELTA_MS,
      rateLimit: env.SMTP_POOL_RATE_LIMIT,
      // Sem esses limites, o Nodemailer cai nos timeouts do SO (até ~10 min por socket)
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS
    });
    await verifyTransporter(transporter);
    this.transporter = transporter;
    return transporter;
  }
  async send(request) {
    if (!this.breaker) {
      return this.dispatch(request);
    }
    return this.breaker.execute(() => this.dispatch(request));
  }
  /**
   * Um envio, sem política. A verificação do transportador entra no escopo do
   * breaker de propósito: um SMTP que não autentica falha aqui exatamente como
   * um que não entrega, e é a mesma indisponibilidade.
   */
  async dispatch({ to, subject, message, html, attachments }) {
    const transporter = await this.getTransporter();
    return transporter.sendMail({
      from: env.SMTP_EMAIL,
      to,
      subject,
      text: message,
      html,
      ...attachments ? { attachments } : {}
    });
  }
  /** Estado atual do circuito — exposto para teste e diagnóstico. */
  get circuitState() {
    return this.breaker?.state ?? null;
  }
};
async function verifyTransporter(transporter) {
  try {
    await transporter.verify();
  } catch (error) {
    logger.error({ error }, EMAIL_LOGS.SMTP_VERIFY_FAILED);
    throw error;
  }
  logger.info(EMAIL_LOGS.SMTP_VERIFIED);
}
function createSmtpBreaker() {
  if (!env.SMTP_CIRCUIT_BREAKER_ENABLED) {
    return null;
  }
  return (0, import_cockatiel.circuitBreaker)(import_cockatiel.handleAll, {
    halfOpenAfter: env.SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
    breaker: new import_cockatiel.SamplingBreaker({
      threshold: env.SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      duration: env.SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
      minimumRps: env.SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT
    })
  });
}

// src/use-cases/factories/make-send-email-use-case.ts
var mailSender = new NodemailerMailSender();
function makeSendEmailUseCase() {
  return new SendEmailUseCase(mailSender);
}

// src/lib/errors/queue/job-already-processing-error.ts
var JobAlreadyProcessingError = class extends InfrastructureError {
  constructor() {
    super(QUEUE_ERRORS.JOB_ALREADY_PROCESSING);
  }
};

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

// src/lib/metrics/email-metrics.ts
var import_prom_client5 = require("prom-client");
var registry5 = getRegistry();
var collectMetricsEmailsSent = registry5 ? new import_prom_client5.Counter({
  name: "emails_sent_total",
  help: "Emails successfully sent to SMTP, counted per successful send (per recipient; a degraded-path re-send re-increments)",
  registers: [registry5]
}) : null;
var collectMetricsEmailsFailed = registry5 ? new import_prom_client5.Counter({
  name: "emails_failed_total",
  help: "Email send failures, counted per recipient per attempt (not per batch)",
  labelNames: ["error_type"],
  registers: [registry5]
}) : null;
var collectMetricsEmailsSkipped = registry5 ? new import_prom_client5.Counter({
  name: "emails_skipped_total",
  help: "Email jobs not sent for a non-failure reason (idempotency dedup, contention, or expiry)",
  labelNames: ["reason"],
  registers: [registry5]
}) : null;
var collectMetricsEmailBatchDuration = registry5 ? new import_prom_client5.Histogram({
  name: "email_batch_duration_seconds",
  help: "Duration of the SMTP send batch (Promise.allSettled), recorded per attempt",
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry5]
}) : null;
var collectMetricsEmailsPermanentRejections = registry5 ? new import_prom_client5.Counter({
  name: "emails_permanent_rejections_total",
  help: "Permanent SMTP rejections (RFC 5xx / invalid mailbox) that bypass retries via UnrecoverableError",
  registers: [registry5]
}) : null;

// src/lib/workers/mail-worker.ts
function createMailJobProcessor(outboxRepository) {
  return async (job) => {
    const { publicId } = job.data;
    const childLogger = logger.child({ jobId: job.id, publicId });
    const redisCache = getRedisCache();
    const idempotencyKey = `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`;
    if (await discardIfExpired(job, outboxRepository, childLogger)) return;
    if (await alreadyHandled(job, outboxRepository, childLogger, redisCache, idempotencyKey)) return;
    await sendBatch(job, outboxRepository, childLogger, redisCache, idempotencyKey);
    const deleteResult = await outboxRepository.delete(publicId);
    if (isErr(deleteResult)) {
      throw deleteResult.error;
    }
    childLogger.info("OutboxEvent deletado com sucesso do banco de dados");
  };
}
async function discardIfExpired(job, outboxRepository, childLogger) {
  if (!job.data.expiresAt || new Date(job.data.expiresAt).getTime() > Date.now()) {
    return false;
  }
  childLogger.warn(WORKER_LOGS.EXPIRED_JOB_SKIPPED);
  const deleteResult = await outboxRepository.delete(job.data.publicId);
  if (isErr(deleteResult)) {
    throw deleteResult.error;
  }
  collectMetricsEmailsSkipped?.inc({ reason: "expired" });
  return true;
}
async function alreadyHandled(job, outboxRepository, childLogger, redisCache, idempotencyKey) {
  const acquired = await redisCache.set(
    idempotencyKey,
    "processing",
    "EX",
    WORKER_CONSTANTS.IDEMPOTENCY_TTL.PROCESSING_SECONDS,
    "NX"
  );
  if (acquired) {
    return false;
  }
  const status = await redisCache.get(idempotencyKey);
  if (status !== "completed") {
    collectMetricsEmailsSkipped?.inc({ reason: "processing" });
    throw new JobAlreadyProcessingError();
  }
  childLogger.warn(WORKER_LOGS.BATCH_ALREADY_SENT);
  const deleteResult = await outboxRepository.delete(job.data.publicId);
  if (isErr(deleteResult)) {
    throw deleteResult.error;
  }
  collectMetricsEmailsSkipped?.inc({ reason: "already_sent" });
  return true;
}
async function sendBatch(job, outboxRepository, childLogger, redisCache, idempotencyKey) {
  try {
    await dispatchAndEvaluate(job, outboxRepository, childLogger);
    childLogger.info("Lote de e-mails processado com sucesso.");
    await redisCache.set(idempotencyKey, "completed", "EX", WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS);
  } catch (err2) {
    await redisCache.del(idempotencyKey);
    if (err2 instanceof InfrastructureError || isUnrecoverable(err2)) {
      throw err2;
    }
    throw new SmtpDispatchError(err2);
  }
}
async function dispatchAndEvaluate(job, outboxRepository, childLogger) {
  const { emails } = job.data;
  childLogger.info(`Processando lote de ${emails.length} e-mails...`);
  const sendEmailUseCase = makeSendEmailUseCase();
  const end = collectMetricsEmailBatchDuration?.startTimer();
  const results = await Promise.allSettled(emails.map((email) => sendEmailUseCase.execute(email)));
  end?.();
  const failures = results.filter((r) => r.status === "rejected" || isErr(r.value));
  recordSendOutcome(results, failures);
  if (failures.length === 0) {
    return;
  }
  if (failures.length < results.length) {
    await persistSelectiveRetry(job, outboxRepository, childLogger, results, failures.length);
  }
  throwFirstFailure(failures);
}
function recordSendOutcome(results, failures) {
  const successCount = results.length - failures.length;
  if (successCount > 0) {
    collectMetricsEmailsSent?.inc(successCount);
  }
  for (const failure of failures) {
    collectMetricsEmailsFailed?.inc({ error_type: causeOf(failure) instanceof InfrastructureError ? "infra" : "smtp" });
  }
}
function causeOf(failure) {
  if (failure.status === "rejected") {
    return failure.reason;
  }
  return isErr(failure.value) ? failure.value.error : void 0;
}
async function persistSelectiveRetry(job, outboxRepository, childLogger, results, failureCount) {
  const { publicId, emails } = job.data;
  const failedEmails = emails.filter((_, i) => results[i].status === "rejected" || isErr(results[i].value));
  childLogger.warn({ successCount: results.length - failureCount, failureCount }, WORKER_LOGS.PARTIAL_BATCH_FAILURE);
  const dbResult = await outboxRepository.updatePendingRecipients(
    publicId,
    failedEmails.map((e) => e.to)
  );
  if (isErr(dbResult)) {
    childLogger.error({ publicId }, WORKER_LOGS.PENDING_RECIPIENTS_UPDATE_FAILED);
    return;
  }
  try {
    await job.updateData({ ...job.data, emails: failedEmails });
  } catch {
    childLogger.error({ publicId }, WORKER_LOGS.JOB_DATA_UPDATE_FAILED);
  }
}
var SMTP_PERMANENT_CODE_MIN = 500;
var SMTP_PERMANENT_CODE_MAX = 600;
function has5xxResponseCode(code) {
  return typeof code === "number" && code >= SMTP_PERMANENT_CODE_MIN && code < SMTP_PERMANENT_CODE_MAX;
}
function has5xxResponseText(response) {
  return typeof response === "string" && /^5\d\d/.test(response.trim());
}
function matchesPermanentCriteria(target) {
  return has5xxResponseCode(target.responseCode) || target.code === "EENVELOPE" || has5xxResponseText(target.response);
}
function isObject(val) {
  return typeof val === "object" && val !== null;
}
function extractCandidates(error) {
  if (!isObject(error)) {
    return [];
  }
  const err2 = error;
  const candidates = [err2];
  if (isObject(err2.cause)) {
    candidates.push(err2.cause);
  }
  if (isObject(err2.originalError)) {
    candidates.push(err2.originalError);
  }
  return candidates;
}
function isPermanentSmtpError(error) {
  return extractCandidates(error).some(matchesPermanentCriteria);
}
function throwFirstFailure(failures) {
  const firstFailure = failures[0];
  const firstError = causeOf(firstFailure);
  if (failures.every((f) => isPermanentSmtpError(causeOf(f)))) {
    collectMetricsEmailsPermanentRejections?.inc(failures.length);
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    throw new import_bullmq4.UnrecoverableError(message);
  }
  if (firstFailure.status === "rejected") {
    throw firstFailure.reason;
  }
  if (isErr(firstFailure.value)) {
    throw firstFailure.value.error;
  }
}
function createJobFailureHandler(outboxRepository) {
  return async (job, err2) => {
    await handleJobFailure(job, err2, outboxRepository);
  };
}
function jobContext(job) {
  return { jobId: job?.id, publicId: job?.data.publicId };
}
async function handleJobFailure(job, err2, outboxRepository) {
  const context = jobContext(job);
  try {
    if (isTransientBullMQGlitch(err2)) {
      logger.warn({ jobId: context.jobId }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH);
      return;
    }
    logFailure(job, err2);
    if (!isFinalFailure(job, err2)) return;
    captureError(err2, context);
    await revertForRedispatch(context, outboxRepository);
  } catch (handlerError) {
    logger.error({ jobId: context.jobId, err: handlerError }, WORKER_LOGS.FAILURE_HANDLER_ERROR);
    captureError(handlerError, { jobId: context.jobId });
  }
}
function isFinalFailure(job, err2) {
  if (job == null) return false;
  return isUnrecoverable(err2) || isStalledFinal(err2) || job.attemptsMade >= (job.opts.attempts ?? 1);
}
function isUnrecoverable(err2) {
  if (err2 instanceof import_bullmq4.UnrecoverableError) return true;
  if (typeof err2 !== "object" || err2 === null) return false;
  return "name" in err2 && err2.name === "UnrecoverableError";
}
function isStalledFinal(err2) {
  return err2.message.includes("job stalled more than allowable limit");
}
function isTransientBullMQGlitch(err2) {
  const message = err2.message;
  return !isStalledFinal(err2) && (message.includes("Missing lock") || message.includes("job stalled"));
}
function logFailure(job, err2) {
  const isInfrastructureError = "body" in err2 && "statusCode" in err2;
  if (!isInfrastructureError) {
    logger.error({ jobId: job?.id, err: err2.message }, WORKER_LOGS.GENERIC_WORKER_FAILURE);
    return;
  }
  const infraError = err2;
  logger.error(
    {
      jobId: job?.id,
      code: infraError.body.code,
      cause: infraError.cause
    },
    `Falha de Infraestrutura: ${infraError.message}`
  );
}
async function revertForRedispatch(context, outboxRepository) {
  const { jobId, publicId } = context;
  if (!publicId) return;
  const revertResult = await outboxRepository.updateStatus(publicId, "PENDING" /* PENDING */);
  if (isErr(revertResult)) {
    logger.warn({ jobId, publicId, error: revertResult.error }, WORKER_LOGS.OUTBOX_REVERT_AFTER_FINAL_FAILURE_ERROR);
    captureError(revertResult.error, { jobId, publicId });
    return;
  }
  logger.warn({ jobId, publicId }, WORKER_LOGS.OUTBOX_REVERTED_AFTER_FINAL_FAILURE);
}
function startMailWorker(outboxRepository) {
  const workerConnection = createWorkerConnection();
  attachRedisLogger(workerConnection, "MailWorker");
  const worker2 = new import_bullmq4.Worker(QUEUE.NAMES.MAIL, createMailJobProcessor(outboxRepository), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
    lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
    stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS,
    limiter: {
      max: env.MAIL_RATE_LIMIT_MAX,
      duration: env.MAIL_RATE_LIMIT_DURATION_MS
    }
  });
  const onJobFailed = createJobFailureHandler(outboxRepository);
  worker2.on("failed", (job, err2) => {
    void onJobFailed(job, err2);
  });
  return worker2;
}

// src/lib/workers/outbox-dispatch-worker.ts
var import_bullmq5 = require("bullmq");
function createOutboxDispatchJobProcessor(processor) {
  return async (job) => {
    try {
      await processor.processSingleEvent(job.data.event);
    } catch (error) {
      logger.error({ jobId: job.id, publicId: job.data.publicId, error }, "Falha no processamento do evento de outbox");
      captureError(error, { jobId: job.id, publicId: job.data.publicId });
      throw error;
    }
  };
}
function startOutboxDispatchWorker(processor) {
  const workerConnection = createWorkerConnection();
  attachRedisLogger(workerConnection, "OutboxDispatchWorker");
  return new import_bullmq5.Worker(QUEUE.NAMES.OUTBOX_DISPATCH, createOutboxDispatchJobProcessor(processor), {
    connection: workerConnection,
    concurrency: WORKER_CONSTANTS.OUTBOX_DISPATCH.CONCURRENCY_LIMIT,
    lockDuration: WORKER_CONSTANTS.OUTBOX_DISPATCH.LOCK_DURATION_MS,
    stalledInterval: WORKER_CONSTANTS.OUTBOX_DISPATCH.STALLED_INTERVAL_MS
  });
}

// src/lib/queue/outbox-dispatch-queue.ts
var import_bullmq6 = require("bullmq");
var outboxDispatchQueueInstance = null;
function getOutboxDispatchQueue() {
  if (!outboxDispatchQueueInstance) {
    const redisForQueue = getRedisForQueue();
    attachRedisLogger(redisForQueue, QUEUE.NAMES.OUTBOX_DISPATCH);
    outboxDispatchQueueInstance = new import_bullmq6.Queue(QUEUE.NAMES.OUTBOX_DISPATCH, {
      connection: redisForQueue,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5e3
        },
        removeOnComplete: true,
        removeOnFail: true
      }
    });
    outboxDispatchQueueInstance.on("error", (err2) => {
      logger.error({ err: err2 }, WORKER_LOGS.OUTBOX_DISPATCH_QUEUE_ERROR);
    });
  }
  return outboxDispatchQueueInstance;
}
async function closeOutboxDispatchQueue() {
  if (outboxDispatchQueueInstance) {
    const queue = outboxDispatchQueueInstance;
    outboxDispatchQueueInstance = null;
    await queue.close();
  }
}

// src/repositories/prisma/prisma-outbox-event-repository.ts
var import_client2 = require("@prisma/client");
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
  async findFailed(limit) {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: { status: "FAILED" /* FAILED */ },
        orderBy: { occurredAt: "desc" },
        take: limit
      });
      return ok(events.map((e) => this.toEntity(e)));
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async retryFailed(publicId) {
    try {
      const result = await this.dbContext.client.outboxEvent.updateMany({
        where: {
          publicId,
          status: "FAILED" /* FAILED */
        },
        data: {
          status: "PENDING" /* PENDING */,
          sendingAt: null,
          attempts: 0
        }
      });
      return ok(result.count === 1);
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
  async claim(filter) {
    try {
      const result = await this.dbContext.client.outboxEvent.updateMany({
        where: {
          publicId: filter.publicId,
          status: filter.fromStatus,
          ...filter.stuckBefore ? { sendingAt: { lte: filter.stuckBefore } } : {}
        },
        data: {
          status: "SENDING" /* SENDING */,
          sendingAt: /* @__PURE__ */ new Date(),
          attempts: { increment: 1 }
        }
      });
      return ok(result.count === 1);
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
      if (error instanceof import_client2.Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
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
  async deleteFailedOlderThan(cutoff, batchSize) {
    try {
      const batch = await this.dbContext.client.outboxEvent.findMany({
        where: {
          status: "FAILED" /* FAILED */,
          occurredAt: { lt: cutoff }
        },
        select: { id: true },
        orderBy: { occurredAt: "asc" },
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

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client3 = require("@prisma/client");

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
    if (error instanceof import_client3.Prisma.PrismaClientKnownRequestError) {
      const errorFactory = safeLookup(this.errorMapping, error.code);
      if (errorFactory) {
        return errorFactory(error);
      }
    }
    return new DatabaseQueryError(error);
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

// src/lib/shutdown/crash-shutdown.ts
var import_node3 = require("@sentry/node");
var SENTRY_FLUSH_TIMEOUT_MS = 2e3;
async function crashShutdown(error) {
  logger.fatal({ err: error }, "Travamento n\xE3o tratado detectado, iniciando sequ\xEAncia de encerramento por falha...");
  await reportToSentry(error);
}
async function reportToSentry(error) {
  try {
    (0, import_node3.captureException)(error instanceof Error ? error : new Error(String(error)));
    await (0, import_node3.flush)(SENTRY_FLUSH_TIMEOUT_MS);
    logger.info("Logs do Sentry enviados com sucesso.");
  } catch (sentryError) {
    logger.error({ err: sentryError }, "Erro ao enviar os logs do Sentry durante o encerramento por travamento");
  }
}

// src/worker.ts
var import_close_with_grace = __toESM(require("close-with-grace"));

// src/lib/metrics/bullmq-metrics.ts
var import_prom_client6 = require("prom-client");
var registry6 = getRegistry();
var collectMetricsBullmqJobs = registry6 ? new import_prom_client6.Gauge({
  name: "bullmq_jobs",
  help: "Current job count by state",
  labelNames: ["queue", "state"],
  registers: [registry6]
}) : null;
var queues = /* @__PURE__ */ new Map();
function registerQueue(name, queue) {
  queues.set(name, queue);
}
function unregisterQueue(name) {
  queues.delete(name);
}
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
var import_fastify = __toESM(require("fastify"));
var import_prom_client7 = require("prom-client");

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

// src/metrics-server.ts
var METRICS_COLLECTION_TIMEOUT_MS = 2e3;
var metricsServer = null;
var registry7 = getRegistry();
var metricsCollectionErrors = registry7 ? new import_prom_client7.Counter({
  name: "metrics_collection_errors_total",
  help: "Errors during metrics collection",
  labelNames: ["source"],
  registers: [registry7]
}) : null;
function withTimeout(promise, ms4, source) {
  return abortRace(promise, AbortSignal.timeout(ms4), () => {
    metricsCollectionErrors?.inc({ source });
    throw new Error(`${source} timeout`);
  });
}
async function startMetricsServer(options) {
  if (!env.METRICS_ENABLED) {
    logger.info("Servidor de m\xE9tricas desabilitado");
    return;
  }
  metricsServer = (0, import_fastify.default)({ logger: false });
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

// src/worker.ts
initSentry();
var worker = null;
var outboxDispatchWorker = null;
var maintenanceWorker = null;
async function startMaintenance(outboxRepository, outboxProcessor) {
  maintenanceWorker = startMaintenanceWorker({
    processor: outboxProcessor,
    maintenance: new OutboxMaintenance(outboxRepository),
    analyticsRetention: new AnalyticsRetention(new PrismaAnalyticsRepository())
  });
  registerQueue(QUEUE.NAMES.MAINTENANCE, getMaintenanceQueue());
  await startMaintenanceScheduler();
}
async function bootstrap() {
  try {
    logger.info("Inicializando servi\xE7os de background...");
    const dbContext = new DatabaseContext();
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
    worker = startMailWorker(outboxRepository);
    logger.info("Mail worker iniciado");
    registerQueue(QUEUE.NAMES.MAIL, getMailQueue());
    const outboxProcessor = new OutboxProcessor(outboxRepository, makeOutboxDispatchStrategyRegistry());
    outboxDispatchWorker = startOutboxDispatchWorker(outboxProcessor);
    logger.info("Outbox dispatch worker iniciado");
    registerQueue(QUEUE.NAMES.OUTBOX_DISPATCH, getOutboxDispatchQueue());
    await startMaintenance(outboxRepository, outboxProcessor);
    try {
      await startMetricsServer({ port: env.METRICS_WORKER_PORT });
    } catch (metricsErr) {
      logger.error(
        { err: metricsErr },
        "Falha ao iniciar o servidor de m\xE9tricas do worker; o worker continuar\xE1 sem m\xE9tricas"
      );
      captureError(metricsErr);
    }
  } catch (error) {
    await crashShutdown(error);
  }
}
async function cleanup() {
  const tasks = [
    async () => {
      if (outboxDispatchWorker) {
        await outboxDispatchWorker.close();
        logger.info("Outbox dispatch worker finalizado");
      }
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.OUTBOX_DISPATCH);
      await closeOutboxDispatchQueue();
      logger.info("OutboxDispatchQueue finalizada");
    },
    async () => {
      if (worker) {
        await worker.close();
        logger.info("Worker finalizado");
      }
    },
    async () => {
      if (maintenanceWorker) {
        await maintenanceWorker.close();
        logger.info("Worker de manuten\xE7\xE3o finalizado");
      }
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.MAIL);
      await getMailQueue().close();
      logger.info("MailQueue finalizada");
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.MAINTENANCE);
      await getMaintenanceQueue().close();
      logger.info("MaintenanceQueue finalizada");
    },
    stopMetricsServer,
    async () => {
      await closeAllRedisConnections();
      logger.info("Conex\xF5es Redis finalizadas");
    }
  ];
  for (const task of tasks) {
    try {
      await task();
    } catch (err2) {
      logger.error(err2, "Erro durante o encerramento do worker");
    }
  }
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
        await cleanup();
        logger.info("Limpeza de encerramento por travamento conclu\xEDda com sucesso.");
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, "Ocorreu um erro durante a limpeza de encerramento por travamento");
      }
      await crashShutdown(err2);
    } else {
      logger.info({ signal }, `Recebido sinal ${signal ?? "desconhecido"}. Iniciando graceful shutdown do worker...`);
      await cleanup();
      logger.info("Worker encerrado graciosamente.");
    }
  }
);
void bootstrap();
