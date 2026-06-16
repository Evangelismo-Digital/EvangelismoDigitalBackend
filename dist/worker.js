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

// src/lib/infra/jobs/outbox-cron.ts
var import_node_cron = __toESM(require("node-cron"));

// src/core/constants/outbox/locks.ts
var LOCK_KEYS = {
  OUTBOX_PROCESSOR: "lock:outbox-processor",
  OUTBOX_RECOVERY: "lock:outbox-recovery"
};
var LOCK_TTL_MS = {
  DEFAULT: 1e4
};

// src/core/constants/queue/queue.ts
var QUEUE_NAMES = {
  MAIL: "mail-queue"
};
var JOB_NAMES = {
  OUTBOX_DISPATCH: "outbox-dispatch"
};

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));

// src/env/index.ts
var import_zod = require("zod");
var import_ms = __toESM(require("ms"));
process.loadEnvFile?.(".env");
var envSchema = import_zod.z.object({
  // Environment
  NODE_ENV: import_zod.z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: import_zod.z.enum(["info", "debug", "warn", "error", "trace"]).default("info"),
  // Database
  DATABASE_URL: import_zod.z.url(),
  DATABASE_URL_LOCAL: import_zod.z.url().optional(),
  DB_POOL_MAX: import_zod.z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: import_zod.z.coerce.number().int().positive().default(2),
  DB_CONNECTION_TIMEOUT: import_zod.z.coerce.number().int().positive().default((0, import_ms.default)("10s")),
  DB_IDLE_TIMEOUT: import_zod.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  // Redis
  REDIS_HOST: import_zod.z.string().default("localhost"),
  REDIS_PORT: import_zod.z.coerce.number().default(6379),
  REDIS_PASSWORD: import_zod.z.string().optional(),
  REDIS_LOG_OUTAGE_INTERVAL_MS: import_zod.z.coerce.number().int().positive().default((0, import_ms.default)("30s")),
  // App
  APP_NAME: import_zod.z.string().default("Backend Template Reborn"),
  APP_PORT: import_zod.z.coerce.number().default(3e3),
  JWT_SECRET: import_zod.z.string().min(60, "JWT secret must be at least 60 characters long"),
  FRONTEND_URL: import_zod.z.url().default("http://localhost:5173"),
  HASH_SALT_ROUNDS: import_zod.z.coerce.number().default(12),
  // HTTP rate limits (test overrides supported via env)
  HTTP_RATE_LIMIT_GLOBAL_MAX: import_zod.z.coerce.number().int().positive().default(300),
  HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX: import_zod.z.coerce.number().int().positive().default(3e4),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  SENTRY_DSN: import_zod.z.string().optional(),
  // SMTP
  SMTP_EMAIL: import_zod.z.email(),
  SMTP_PASSWORD: import_zod.z.string().min(1),
  SMTP_PORT: import_zod.z.coerce.number(),
  SMTP_HOST: import_zod.z.string().min(1),
  SMTP_SECURE: import_zod.z.enum(["true", "false"]).transform((val) => val === "true"),
  // ADMIN EMAIL
  ADMIN_EMAIL: import_zod.z.email(),
  // Address Providers
  AWESOME_API_URL: import_zod.z.string(),
  //Also geocoding provider
  AWESOME_API_TOKEN: import_zod.z.string().min(1),
  VIACEP_API_URL: import_zod.z.string(),
  BRASIL_API_URL: import_zod.z.string(),
  // Geocoding Providers
  // Nominatim (Fallback)
  NOMINATIM_API_URL: import_zod.z.string(),
  LOCATION_IQ_API_URL: import_zod.z.string().default("https://us1.locationiq.com/v1"),
  LOCATION_IQ_API_TOKEN: import_zod.z.string().min(1),
  // Stadia API
  STADIA_MAPS_API_URL: import_zod.z.url().default("https://api.stadiamaps.com/route/v1"),
  STADIA_API_TOKEN: import_zod.z.string().min(1, "STADIA_API_TOKEN is required")
});
var _env = envSchema.safeParse(process.env);
if (!_env.success) {
  console.error("Invalid environment variables:", import_zod.z.treeifyError(_env.error));
  throw new Error("Invalid environment variables. Please check your .env file or environment configuration.");
}
var env = _env.data;

// src/lib/logger/index.ts
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();
function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId;
}
function getUserId() {
  return asyncLocalStorage.getStore()?.userId;
}
var isDev = env.NODE_ENV === "development";
var baseConfig = {
  level: env.LOG_LEVEL || "info",
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  mixin() {
    return { requestId: getRequestId(), userId: getUserId() };
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

// src/lib/redis/connections/redis-outage-logger.ts
var CONNECTIVITY_ERROR_CODES = /* @__PURE__ */ new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN"
]);
function isRedisConnectivityError(error) {
  const err = error ?? {};
  const message = (err.message ?? "").toUpperCase();
  const code = (err.code ?? "").toUpperCase();
  if (CONNECTIVITY_ERROR_CODES.has(code)) {
    return true;
  }
  return message.includes("ECONNREFUSED") || message.includes("CONNECTION IS CLOSED") || message.includes("READONLY") || message.includes("ETIMEDOUT") || message.includes("NOAUTH");
}
var RedisOutageLogger = class {
  constructor(config) {
    this.config = config;
    this.intervalMs = env.REDIS_LOG_OUTAGE_INTERVAL_MS;
  }
  intervalMs;
  outageStartedAt = null;
  lastWarnAt = 0;
  suppressedEvents = 0;
  onOutage(event, error) {
    const now = Date.now();
    const err = error ?? {};
    if (this.outageStartedAt === null) {
      this.outageStartedAt = now;
      this.lastWarnAt = now;
      this.suppressedEvents = 0;
      logger.warn(
        {
          subsystem: this.config.subsystem,
          redisHost: this.config.host,
          redisPort: this.config.port,
          event,
          errorCode: err.code,
          errorName: err.name,
          errorMessage: err.message
        },
        "Redis connection degraded"
      );
      return;
    }
    if (now - this.lastWarnAt >= this.intervalMs) {
      logger.warn(
        {
          subsystem: this.config.subsystem,
          redisHost: this.config.host,
          redisPort: this.config.port,
          event,
          errorCode: err.code,
          errorName: err.name,
          errorMessage: err.message,
          outageDurationMs: now - this.outageStartedAt,
          suppressedEvents: this.suppressedEvents
        },
        "Redis connection still degraded"
      );
      this.lastWarnAt = now;
      this.suppressedEvents = 0;
      return;
    }
    this.suppressedEvents += 1;
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
      "Redis connection recovered"
    );
    this.outageStartedAt = null;
    this.lastWarnAt = 0;
    this.suppressedEvents = 0;
  }
};

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
  const outageLogger = new RedisOutageLogger({
    subsystem: "bullmq",
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
  });
  redis.on("ready", () => {
    outageLogger.onRecovery();
  });
  redis.on("connect", () => {
    outageLogger.onRecovery();
  });
  redis.on("error", (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage("error", error);
      return;
    }
    logger.error(
      {
        subsystem: "bullmq",
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      },
      "Unexpected Redis BullMQ connection error"
    );
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
  return redis;
}
function attachRedisLogger(redis, context) {
  const outageLogger = new RedisOutageLogger({
    subsystem: "bullmq",
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
  });
  redis.on("connect", () => {
    logger.info(`\u{1F517} Redis (${context}) connection established`);
    outageLogger.onRecovery();
  });
  redis.on("ready", () => {
    logger.info(`\u2705 Redis (${context}) is ready`);
    outageLogger.onRecovery();
  });
  redis.on("error", (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage("error", error);
      return;
    }
    logger.error({ context, err: error.message }, "\u274C Redis connection glitch");
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
}

// src/lib/redis/connections/redis-cache-connection.ts
var import_ioredis2 = __toESM(require("ioredis"));
function createRedisCacheConnection() {
  const redis = new import_ioredis2.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || void 0,
    commandTimeout: 1e3,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 2) return null;
      return Math.min(times * 50, 500);
    }
  });
  const outageLogger = new RedisOutageLogger({
    subsystem: "cache",
    host: env.REDIS_HOST,
    port: env.REDIS_PORT
  });
  redis.on("ready", () => {
    outageLogger.onRecovery();
  });
  redis.on("connect", () => {
    outageLogger.onRecovery();
  });
  redis.on("error", (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage("error", error);
      return;
    }
    logger.error(
      {
        subsystem: "cache",
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      },
      "Unexpected Redis cache connection error"
    );
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
  return redis;
}

// src/lib/redis/connections/redis-rate-limiter-connection.ts
var import_ioredis3 = __toESM(require("ioredis"));

// src/lib/redis/clients/clients.ts
var redisCacheInstance = null;
var redisForQueueInstance = null;
function getRedisCache() {
  if (!redisCacheInstance) {
    redisCacheInstance = createRedisCacheConnection();
  }
  return redisCacheInstance;
}
function getRedisForQueue() {
  if (!redisForQueueInstance) {
    redisForQueueInstance = createRedisBullMQConnection();
  }
  return redisForQueueInstance;
}
function createWorkerConnection() {
  return createRedisBullMQConnection();
}

// src/lib/queue/mail-queue.ts
var import_bullmq = require("bullmq");
var redisForQueue = getRedisForQueue();
attachRedisLogger(redisForQueue, QUEUE_NAMES.MAIL);
var mailQueue = new import_bullmq.Queue(QUEUE_NAMES.MAIL, {
  connection: redisForQueue,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1e4
    },
    removeOnComplete: true,
    removeOnFail: true
  }
});
mailQueue.on("error", (err) => {
  logger.error({ err }, "\u274C Erro na MailQueue (Producer)");
});

// src/lib/infra/distributed-lock/distributed-lock.ts
var import_node_crypto = require("crypto");
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
        return null;
      }
      return token;
    } catch (error) {
      logger.error({ error, key }, "Falha ao tentar adquirir Distributed Lock");
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
    const redisCache = getRedisCache();
    try {
      const result = await redisCache.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs));
      const renewed = result === 1;
      if (!renewed) {
        logger.warn({ key }, "Distributed Lock n\xE3o renovado: expirou ou pertence a outra inst\xE2ncia");
      }
      return renewed;
    } catch (error) {
      logger.error({ error, key }, "Falha ao tentar renovar Distributed Lock");
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
    const redisCache = getRedisCache();
    try {
      const result = await redisCache.eval(RELEASE_SCRIPT, 1, key, token);
      if (result === 0) {
        logger.warn({ key }, "Distributed Lock j\xE1 havia expirado ou pertencia a outra inst\xE2ncia no momento do release");
      }
    } catch (error) {
      logger.warn({ error, key }, "Falha ao liberar Distributed Lock (ele expirar\xE1 sozinho pelo TTL)");
    }
  }
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

// src/templates/contact-user/contact-user-html.ts
function contactUserHtmlTemplate(name) {
  return `
            <div>
                <table style="font-family: arial">
                    <tr>
                        <td align="center" style="background-color: #eb5933; padding: 20px; color: white;">
                            <h1>Evangelismo Digital</h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px; font-size: 20px;">
                            <p>Gra\xE7a e paz, <strong>${name}</strong>!</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px; font-size: 20px;">
                            <p>Recebemos sua mensagem. \xC9 uma honra que voc\xEA esteja se conectando conosco!</p>
                            <p>Voc\xEA ser\xE1 adicionado \xE0 nossa lista de e-mails para receber atualiza\xE7\xF5es, recursos e inspira\xE7\xE3o para lhe auxiliar na sua jornada.</p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 20px; text-align: center; font-size: 12px; color: #999999;">
                            <p style="margin: 5px 0 0;">Se deseja n\xE3o receber mais estes e-mails, <a href="#" style="color: #999999; text-decoration: underline;">clique aqui</a>.</p>
                        </td>
                    </tr>
                </table>
            </div>
        `;
}

// src/templates/contact-staff/contact-staff-subject-text.ts
function contactStaffSubjectTextTemplate() {
  return `
            Novo formul\xE1rio enviado
        `;
}

// src/templates/contact-staff/contact-staff-text.ts
function contactStaffTextTemplate(name, email) {
  return `
            ${name} <${email}> enviou um formul\xE1rio.
        `;
}

// src/templates/contact-staff/contact-staff-html.ts
function contactStaffHtmlTemplate(name, lastName, email) {
  return `
            <div>
                <table style="font-family: arial">
                    <tr>
                        <td align="center" style="background-color: #eb5933; padding: 20px; color: white;">
                            <h1>Boas not\xEDcias!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px; font-size: 20px;">
                            <p>Um novo formul\xE1rio acaba de ser enviado!</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px; font-size: 20px;">
                            <p><strong>Nome:</strong> ${name} ${lastName}</p>
                            <p><strong>Email:</strong> ${email}</p>
                        </td>
                    </tr>
                </table>
            </div>
        `;
}

// src/use-cases/forms/strategies/contact-email-strategy.ts
var ContactEmailStrategy = class {
  buildUserEmail(form) {
    const email = this.getStringField(form.email, "form.email");
    const name = this.getStringField(form.name, "form.name");
    return {
      to: email,
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: contactUserHtmlTemplate(name),
      context: { type: "contact", recipient: "user" }
    };
  }
  buildStaffEmail(form) {
    const email = this.getStringField(form.email, "form.email");
    const name = this.getStringField(form.name, "form.name");
    const lastName = this.getOptionalStringField(form.lastName, "form.lastName");
    return {
      to: env.ADMIN_EMAIL,
      subject: contactStaffSubjectTextTemplate(),
      message: contactStaffTextTemplate(name, email),
      html: contactStaffHtmlTemplate(name, lastName, email),
      context: { type: "contact", recipient: "internal" }
    };
  }
  getStringField(value, fieldName) {
    if (typeof value === "string") {
      return value;
    }
    throw new Error(`Invalid value for ${fieldName}: expected a string.`);
  }
  getOptionalStringField(value, fieldName) {
    if (value === void 0 || typeof value === "string") {
      return value || "";
    }
    throw new Error(`Invalid value for ${fieldName}: expected a string or undefined.`);
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

// src/templates/decision-for-christ-user/decision-for-christ-user-html.ts
function decisionForChristUserHtmlTemplate(name) {
  return `
            <p>
                Ol\xE1 <strong>${name}</strong>,
            </p>
            <p>
                \xC9 uma alegria saber que voc\xEA tomou uma decis\xE3o por Cristo.
                
                Em breve, nossa equipe entrar\xE1 em contato para acompanh\xE1-lo nessa nova jornada.
            </p>
        `;
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-subject-text.ts
function decisionForChristStaffSubjectText() {
  return `
      Nova decis\xE3o por Cristo registrada
    `;
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-text.ts
function decisionForChristStaffTextTemplate(name, email) {
  return `
            ${name} <${email}> aceitou a Cristo.
        `;
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-html.ts
function decisionForChristStaffHtmlTemplate(name, lastName, email, location) {
  return `
            <p>
                Nova decis\xE3o por Cristo:
            </p>
            <ul>
                <li>
                    Nome: ${name} ${lastName}
                </li>
                <li>
                    Email: ${email}
                </li>
                <li>
                    Local: ${location ?? "n\xE3o informado"}
                </li>
            </ul>
        `;
}

// src/use-cases/forms/strategies/decision-for-christ-email-strategy.ts
var DecisionForChristEmailStrategy = class {
  buildUserEmail(form) {
    const email = this.getStringField(form.email, "form.email");
    const name = this.getStringField(form.name, "form.name");
    return {
      to: email,
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: decisionForChristUserHtmlTemplate(name),
      context: { type: "decision-for-Christ", recipient: "user" }
    };
  }
  buildStaffEmail(form) {
    const email = this.getStringField(form.email, "form.email");
    const name = this.getStringField(form.name, "form.name");
    const lastName = this.getStringField(form.lastName, "form.lastName");
    const location = this.getOptionalStringField(form.location, "form.location");
    return {
      to: env.ADMIN_EMAIL,
      subject: decisionForChristStaffSubjectText(),
      message: decisionForChristStaffTextTemplate(name, email),
      html: decisionForChristStaffHtmlTemplate(name, lastName, email, location),
      context: { type: "decision-for-Christ", recipient: "internal" }
    };
  }
  getStringField(value, fieldName) {
    if (typeof value === "string") {
      return value;
    }
    throw new Error(`Invalid value for ${fieldName}: expected a string.`);
  }
  getOptionalStringField(value, fieldName) {
    if (value === void 0 || typeof value === "string") {
      return value || "";
    }
    throw new Error(`Invalid value for ${fieldName}: expected a string or undefined.`);
  }
};

// src/core/constants/outbox/outbox-thresholds.ts
var OUTBOX_THRESHOLDS = {
  /** Time in ms after which a SENDING event is considered stuck (e.g., after a crash) */
  STUCK_SENDING_MS: 3e4,
  /** Maximum number of pending events fetched per processing cycle */
  PENDING_FETCH_LIMIT: 50
};

// src/lib/infra/jobs/outbox-processor.ts
var OutboxProcessor = class {
  constructor(outboxRepository) {
    this.outboxRepository = outboxRepository;
  }
  LOCK_KEY = LOCK_KEYS.OUTBOX_PROCESSOR;
  LOCK_TTL_MS = LOCK_TTL_MS.DEFAULT;
  async processEvents() {
    let lockToken = null;
    try {
      lockToken = await DistributedLock.acquire(this.LOCK_KEY, this.LOCK_TTL_MS);
      if (!lockToken) {
        logger.warn("processEvents: Processamento ignorado. Outra inst\xE2ncia j\xE1 est\xE1 rodando.");
        return;
      }
      const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_THRESHOLDS.PENDING_FETCH_LIMIT);
      if (pendingEventsResult.success === false) {
        logger.error({ error: pendingEventsResult.error }, "\u274C Erro de Infra ao buscar eventos pendentes.");
        return;
      }
      const pendingEvents = pendingEventsResult.value;
      if (pendingEvents.length === 0) return;
      logger.info(`Processando ${pendingEvents.length} eventos pendentes da Outbox...`);
      for (const event of pendingEvents) {
        await DistributedLock.renew(this.LOCK_KEY, lockToken, this.LOCK_TTL_MS);
        await this.processSingleEvent(event);
      }
    } catch (error) {
      logger.error({ error }, "\u274C Erro cr\xEDtico inesperado no loop principal de processEvents");
    } finally {
      if (lockToken) {
        await DistributedLock.release(this.LOCK_KEY, lockToken);
      }
    }
  }
  async recoverStuckSendingEvents() {
    let lockToken = null;
    try {
      lockToken = await DistributedLock.acquire(LOCK_KEYS.OUTBOX_RECOVERY, this.LOCK_TTL_MS);
      if (!lockToken) return;
      const thresholdDate = new Date(Date.now() - OUTBOX_THRESHOLDS.STUCK_SENDING_MS);
      const stuckEventsResult = await this.outboxRepository.findStuck(thresholdDate);
      if (stuckEventsResult.success === false) {
        logger.error({ error: stuckEventsResult.error }, "\u274C Erro de Infra ao buscar eventos travados na Outbox.");
        return;
      }
      const stuckEvents = stuckEventsResult.value;
      if (stuckEvents.length > 0) {
        logger.warn(`\u267B\uFE0F Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recupera\xE7\xE3o...`);
        for (const event of stuckEvents) {
          await DistributedLock.renew(LOCK_KEYS.OUTBOX_RECOVERY, lockToken, this.LOCK_TTL_MS);
          await this.processSingleEvent(event);
        }
      }
    } catch (error) {
      logger.error({ error }, "\u274C Erro cr\xEDtico inesperado no recoverStuckSendingEvents");
    } finally {
      if (lockToken) {
        await DistributedLock.release(LOCK_KEYS.OUTBOX_RECOVERY, lockToken);
      }
    }
  }
  async processSingleEvent(event) {
    try {
      const updateResult = await this.outboxRepository.updateStatus(event.publicId, "SENDING" /* SENDING */);
      if (updateResult.success === false) throw updateResult.error;
      await this.dispatchToBullMQ(event);
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, "PENDING" /* PENDING */);
      if (revertResult.success === false) {
        logger.error(
          { publicId: event.publicId, error: revertResult.error },
          "\u{1F6A8} FATAL: Falha ao reverter status para PENDING. Inconsist\xEAncia na DB."
        );
      } else {
        logger.error({ publicId: event.publicId, error }, "\u274C Falha no dispatch, revertido para PENDING");
      }
    }
  }
  async dispatchToBullMQ(event) {
    const payload = event.payload;
    const strategy = payload.decisaoPorCristo ? new DecisionForChristEmailStrategy() : new ContactEmailStrategy();
    const userJob = strategy.buildUserEmail(payload);
    const staffJob = strategy.buildStaffEmail(payload);
    await mailQueue.add(
      JOB_NAMES.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: [userJob, staffJob]
      },
      { jobId: event.publicId }
    );
  }
};

// src/core/shared/result.ts
var ok = (value) => ({
  success: true,
  value
});
var errOf = (error) => ({
  success: false,
  error
});

// src/repositories/prisma/prisma-outbox-event-repository.ts
var PrismaOutboxRepository = class {
  constructor(dbContext, httpErrorMapper, infraErrorMapper) {
    this.dbContext = dbContext;
    this.httpErrorMapper = httpErrorMapper;
    this.infraErrorMapper = infraErrorMapper;
  }
  async create(data) {
    try {
      const outboxEvent = await this.dbContext.client.outboxEvent.create({
        data: {
          type: data.type,
          status: data.status,
          payload: data.payload
        }
      });
      return ok(this.toEntity(outboxEvent));
    } catch (error) {
      return errOf(this.httpErrorMapper.mapToKnownError(error));
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
      return errOf(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async findStuck(stuckBefore) {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: {
          status: "SENDING" /* SENDING */,
          sendingAt: { lte: stuckBefore }
        },
        orderBy: { sendingAt: "asc" }
      });
      return ok(events.map((e) => this.toEntity(e)));
    } catch (error) {
      return errOf(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async findByPublicId(publicId) {
    try {
      const event = await this.dbContext.client.outboxEvent.findUnique({
        where: { publicId }
      });
      return ok(event ? this.toEntity(event) : null);
    } catch (error) {
      return errOf(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async updateStatus(publicId, status) {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: {
          status,
          ...status === "SENDING" /* SENDING */ && { sendingAt: /* @__PURE__ */ new Date() }
        }
      });
      return ok(void 0);
    } catch (error) {
      return errOf(this.infraErrorMapper.mapToKnownError(error));
    }
  }
  async delete(publicId) {
    try {
      await this.dbContext.client.outboxEvent.delete({
        where: { publicId }
      });
      return ok(void 0);
    } catch (error) {
      return errOf(this.infraErrorMapper.mapToKnownError(error));
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
      occurredAt: raw.occurredAt,
      sendingAt: raw.sendingAt || void 0
    };
  }
};

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client = require("@prisma/client");

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
   * @param detail       – the error descriptor (code + message + optional extras)
   * @param type         – the HTTP-level error type
   * @param failureMode  – optional routing failure mode (RETRYABLE | NOT_FOUND)
   */
  constructor(detail, type, failureMode) {
    super(detail.message);
    this.name = this.constructor.name;
    this.type = type;
    this.failureMode = failureMode;
    this.body = {
      code: detail.code,
      message: detail.message,
      ...detail.issues && { issues: detail.issues }
    };
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// src/errors/infrastructure-error.ts
var InfrastructureError = class extends AppError {
  originalError;
  constructor(detail, originalError, type = "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */, failureMode) {
    super(detail, type, failureMode);
    this.originalError = originalError;
    if (originalError) {
      this.body.originalError = originalError instanceof Error ? originalError.stack || originalError.message : originalError;
    }
  }
};

// src/messages/errors/providers/providers-error-messages.ts
var DATABASE_QUERY_FAILURE_ERROR = {
  code: "DATABASE_QUERY_FAILURE",
  message: "Falha de sistema ao processar consulta no banco de dados."
};

// src/errors/infrastructure/database-query-error.ts
var DatabaseQueryError = class extends InfrastructureError {
  constructor(originalError) {
    super(DATABASE_QUERY_FAILURE_ERROR, originalError, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
    this.name = "DatabaseQueryError";
  }
};

// src/lib/prisma/utils/prisma-error-mapper.ts
var PrismaErrorMapper = class {
  constructor(errorMapping) {
    this.errorMapping = errorMapping;
  }
  mapToKnownError(error) {
    if (error instanceof AppError) {
      return error;
    }
    if (error instanceof import_client.Prisma.PrismaClientKnownRequestError) {
      const prismaError = error;
      const errorFactory = this.errorMapping[prismaError.code];
      if (errorFactory) {
        return errorFactory(prismaError);
      }
    }
    return new DatabaseQueryError(error);
  }
};

// src/messages/errors/use-cases/outbox-events/outbox-error-messages.ts
var OUTBOX_EVENT_NOT_FOUND_ERROR = {
  code: "OUTBOX_EVENT_NOT_FOUND",
  message: "O evento de outbox solicitado n\xE3o foi encontrado no banco de dados."
};
var OUTBOX_OPERATION_FAILED_ERROR = {
  code: "OUTBOX_OPERATION_FAILED",
  message: "Falha ao processar opera\xE7\xE3o da outbox no banco de dados."
};

// src/errors/system-error.ts
var SystemError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type) {
    super(detail, type);
  }
};

// src/errors/domain-error.ts
var DomainError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type, failureMode) {
    super(detail, type, failureMode);
  }
};

// src/use-cases/errors/outbox/outbox-errors.ts
var OutboxEventNotFoundHttpError = class extends DomainError {
  constructor() {
    super(OUTBOX_EVENT_NOT_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */);
  }
};
var OutboxOperationFailedHttpError = class extends SystemError {
  constructor() {
    super(OUTBOX_OPERATION_FAILED_ERROR, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};
var OutboxEventNotFoundInfraError = class extends InfrastructureError {
  constructor(originalError) {
    super(OUTBOX_EVENT_NOT_FOUND_ERROR, originalError);
  }
};
var OutboxOperationFailedInfraError = class extends InfrastructureError {
  constructor(originalError) {
    super(OUTBOX_OPERATION_FAILED_ERROR, originalError);
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

// src/lib/async-local-storage/index.ts
var import_node_async_hooks2 = require("async_hooks");
var asyncLocalStorage2 = new import_node_async_hooks2.AsyncLocalStorage();

// src/messages/errors/system/async-local-storage.ts
var ASYNC_LOCAL_STORAGE_NOT_INITIALIZED_ERROR = {
  message: "Async Local Storage is not initialized.",
  code: "ASYNC_LOCAL_STORAGE_NOT_INITIALIZED"
};

// src/lib/errors/async-local-storage/async-local-storage-not-initialized-error.ts
var AsyncLocalStorageNotInitializedError = class extends SystemError {
  constructor() {
    super(ASYNC_LOCAL_STORAGE_NOT_INITIALIZED_ERROR, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/lib/prisma/index.ts
var import_client2 = require("@prisma/client");

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
var prisma = new import_client2.PrismaClient({
  adapter,
  log: env.LOG_LEVEL === "debug" ? ["query", "info", "warn", "error"] : []
});

// src/lib/prisma/helpers/database-context.ts
var DatabaseContext = class {
  constructor(prisma2 = prisma) {
    this.prisma = prisma2;
  }
  get client() {
    const prismaTx = asyncLocalStorage2.getStore()?.prismaTransaction;
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
    const store = asyncLocalStorage2.getStore();
    if (!store) {
      throw new AsyncLocalStorageNotInitializedError();
    }
    if (store.prismaTransaction) {
      return await callback();
    }
    return await this.prisma.$transaction(async (tx) => {
      return await asyncLocalStorage2.run(
        {
          ...store,
          prismaTransaction: tx
        },
        callback
      );
    }, options);
  }
};

// src/core/constants/cron/cron.ts
var CRON_SCHEDULES = {
  /** Every day at midnight (00:00:00) */
  MIDNIGHT_DAILY: "0 0 0 * * *"
};

// src/lib/infra/jobs/outbox-cron.ts
function startOutboxCron(existingProcessor) {
  import_node_cron.default.schedule(CRON_SCHEDULES.MIDNIGHT_DAILY, async () => {
    logger.info("\u23F0 Cron de meia-noite: iniciando varredura de seguran\xE7a da Outbox...");
    const processor = existingProcessor ?? buildProcessor();
    try {
      await processor.recoverStuckSendingEvents();
      logger.info("\u2705 Fase 1 (recupera\xE7\xE3o SENDING): conclu\xEDda.");
    } catch (error) {
      logger.error({ error }, "\u274C Fase 1 (recupera\xE7\xE3o SENDING): erro inesperado.");
    }
    try {
      await processor.processEvents();
      logger.info("\u2705 Fase 2 (eventos PENDING): conclu\xEDda.");
    } catch (error) {
      logger.error({ error }, "\u274C Fase 2 (eventos PENDING): erro inesperado.");
    }
    logger.info("\u2705 Varredura de seguran\xE7a da Outbox conclu\xEDda.");
  });
  logger.info("\u{1F5D3}\uFE0F Agendador da Outbox configurado para 00:00 diariamente.");
}
function buildProcessor() {
  const dbContext = new DatabaseContext();
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
  return new OutboxProcessor(outboxRepository);
}

// src/lib/workers/mail-worker.ts
var import_bullmq2 = require("bullmq");

// src/utils/send-email.ts
var import_nodemailer = __toESM(require("nodemailer"));
var transporter = null;
var isVerified = false;
async function getTransporter() {
  if (!transporter) {
    transporter = import_nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_EMAIL,
        pass: env.SMTP_PASSWORD
      }
    });
    if (!isVerified) {
      try {
        await transporter.verify();
        logger.info("transportador SMTP verificado com sucesso");
        isVerified = true;
      } catch (error) {
        logger.error({ error }, "transportador SMTP falhou na verifica\xE7\xE3o");
        throw error;
      }
    }
  }
  return transporter;
}
async function sendEmail({
  to,
  subject,
  message,
  html,
  attachments
}) {
  const emailTransporter = await getTransporter();
  const info = await emailTransporter.sendMail({
    from: env.SMTP_EMAIL,
    to,
    subject,
    text: message,
    html,
    ...attachments ? { attachments } : {}
  });
  return info;
}

// src/use-cases/email/send-email.ts
var SendEmailUseCase = class {
  async execute({ to, subject, message, html, attachments }) {
    return await sendEmail({ to, subject, message, html, attachments });
  }
};

// src/use-cases/factories/make-send-email-use-case.ts
function makeSendEmailUseCase() {
  return new SendEmailUseCase();
}

// src/messages/errors/system/queue.ts
var JOB_ALREADY_PROCESSING_ERROR = {
  message: "Bloqueio de Idempot\xEAncia: Job em processamento simult\xE2neo por outra thread.",
  code: "JOB_ALREADY_PROCESSING"
};
var SMTP_DISPATCH_ERROR = {
  message: "Falha cr\xEDtica ao despachar os e-mails via servidor SMTP.",
  code: "SMTP_DISPATCH_FAILED"
};

// src/lib/errors/queue/job-already-processing-error.ts
var JobAlreadyProcessingError = class extends InfrastructureError {
  constructor() {
    super(JOB_ALREADY_PROCESSING_ERROR);
  }
};

// src/lib/errors/queue/smtp-dispatch-error.ts
var SmtpDispatchError = class extends InfrastructureError {
  constructor(originalError) {
    super(SMTP_DISPATCH_ERROR, originalError);
  }
};

// src/core/constants/redis/redis-keys.ts
var REDIS_KEYS = {
  IDEMPOTENCY_EMAIL_PREFIX: "idempotency:email:",
  RATE_LIMIT_PREFIX: "ratelimit:v1:"
};

// src/core/constants/workers/workers.ts
var MAIL_WORKER_CONFIG = {
  CONCURRENCY_LIMIT: 5,
  LOCK_DURATION_MS: 3e5,
  STALLED_INTERVAL_MS: 3e5
};
var IDEMPOTENCY_TTL = {
  PROCESSING_SECONDS: 300,
  COMPLETED_SECONDS: 86400
};

// src/lib/workers/mail-worker.ts
async function startMailWorker(outboxRepository) {
  const workerConnection = createWorkerConnection();
  attachRedisLogger(workerConnection, "MailWorker");
  const worker2 = new import_bullmq2.Worker(
    QUEUE_NAMES.MAIL,
    async (job) => {
      const { publicId, emails } = job.data;
      const childLogger = logger.child({ jobId: job.id, publicId });
      const redisCache = getRedisCache();
      const idempotencyKey = `${REDIS_KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`;
      const acquired = await redisCache.set(
        idempotencyKey,
        "processing",
        "EX",
        IDEMPOTENCY_TTL.PROCESSING_SECONDS,
        "NX"
      );
      if (!acquired) {
        const status = await redisCache.get(idempotencyKey);
        if (status === "completed") {
          childLogger.warn("\u26A0\uFE0F Lote j\xE1 enviado anteriormente. Limpando DB e abortando duplicata.");
          const deleteResult = await outboxRepository.delete(publicId);
          if (deleteResult.success === false) {
            throw deleteResult.error;
          }
          return;
        }
        throw new JobAlreadyProcessingError();
      }
      try {
        childLogger.info(`\u{1F4E8} Processando lote de ${emails.length} e-mails...`);
        const sendEmailUseCase = makeSendEmailUseCase();
        await Promise.all(emails.map((email) => sendEmailUseCase.execute(email)));
        childLogger.info("\u2705 Lote de e-mails processado com sucesso.");
        await redisCache.set(idempotencyKey, "completed", "EX", IDEMPOTENCY_TTL.COMPLETED_SECONDS);
        const deleteResult = await outboxRepository.delete(publicId);
        if (deleteResult.success === false) {
          throw deleteResult.error;
        }
        childLogger.info("\u{1F5D1}\uFE0F OutboxEvent deletado com sucesso do banco de dados");
      } catch (err) {
        await redisCache.del(idempotencyKey);
        if (err instanceof InfrastructureError) {
          throw err;
        }
        throw new SmtpDispatchError(err);
      }
    },
    {
      connection: workerConnection,
      concurrency: MAIL_WORKER_CONFIG.CONCURRENCY_LIMIT,
      lockDuration: MAIL_WORKER_CONFIG.LOCK_DURATION_MS,
      stalledInterval: MAIL_WORKER_CONFIG.STALLED_INTERVAL_MS
    }
  );
  worker2.on("failed", (job, err) => {
    if (err.message.includes("Missing lock") || err.message.includes("job stalled")) {
      logger.warn({ jobId: job?.id }, "\u26A0\uFE0F Falha de rede interna do BullMQ ap\xF3s processamento. Ignorando.");
      return;
    }
    const isInfrastructureError = "body" in err && "statusCode" in err;
    if (isInfrastructureError) {
      const infraError = err;
      logger.error(
        {
          jobId: job?.id,
          code: infraError.body.code,
          originalError: infraError.body.originalError
        },
        `\u274C Falha de Infraestrutura: ${infraError.message}`
      );
      return;
    }
    logger.error({ jobId: job?.id, err: err.message }, "\u274C Falha gen\xE9rica n\xE3o mapeada no worker");
  });
  return worker2;
}

// src/core/constants/redis/redis-channells.ts
var REDIS_CHANNELS = {
  OUTBOX_SIGNAL: "outbox-signal"
};

// src/lib/infra/events/outbox-signal.ts
var import_ioredis4 = __toESM(require("ioredis"));
var baseConfig2 = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || void 0,
  lazyConnect: true
};
var publisher = null;
var subscriber = null;
function getPublisher() {
  if (!publisher) {
    publisher = new import_ioredis4.default({
      ...baseConfig2,
      enableOfflineQueue: true,
      commandTimeout: 2e3
    });
    publisher.on("connect", () => logger.info("\u2705 Redis publisher conectado ao outbox-signal"));
    publisher.on("error", (err) => logger.error({ err }, "\u274C Redis publisher error no outbox-signal"));
    publisher.on("close", () => logger.warn("\u26A0\uFE0F Redis publisher connection fechada para outbox-signal"));
  }
  return publisher;
}
function getSubscriber() {
  if (!subscriber) {
    subscriber = new import_ioredis4.default({
      ...baseConfig2,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        const delay = Math.min(Math.pow(2, times) * 100, 5e3);
        logger.warn({
          times,
          delay
        });
        return delay;
      }
    });
    subscriber.on("connect", () => logger.info("\u2705 Redis subscriber conectado para outbox-signal"));
    subscriber.on("error", (err) => logger.error({ err }, "\u274C Redis subscriber error no outbox-signal"));
    subscriber.on("close", () => logger.warn("\u26A0\uFE0F Redis subscriber connection fechada para outbox-signal"));
  }
  return subscriber;
}
async function ensureConnected(client, name) {
  if (client.status === "wait" || client.status === "close" || client.status === "end") {
    logger.info(`Conectando ${name}...`);
    await client.connect();
  }
}
var activeMessageListener = null;
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
      await client.publish(REDIS_CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId, event }));
    } catch (err) {
      logger.warn(
        { err },
        "N\xE3o foi poss\xEDvel publicar sinal de nova outbox. O cron job continuar\xE1 funcionando como fallback."
      );
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
        logger.info("Listener anterior de OutboxSignal removido com sucesso");
      }
      activeMessageListener = async (channel, message) => {
        if (channel !== REDIS_CHANNELS.OUTBOX_SIGNAL) {
          logger.warn({ channel }, "Mensagem recebida em canal inesperado. Ignorando.");
          return;
        }
        try {
          const parsed = JSON.parse(message);
          await onSignal(parsed.publicId, parsed.event);
        } catch (err) {
          logger.error({ err, publicId: message }, "Erro ao processar sinal de Outbox");
        }
      };
      client.on("message", activeMessageListener);
      await client.subscribe(REDIS_CHANNELS.OUTBOX_SIGNAL);
    } catch (err) {
      logger.error({ err }, "\u274C Erro ao subscrever ao canal de OutboxSignal");
    }
  },
  async disconnect() {
    const targets = [publisher, subscriber].filter((client) => client !== null);
    if (activeMessageListener !== null) {
      if (subscriber !== null) {
        subscriber.off("message", activeMessageListener);
      }
      activeMessageListener = null;
    }
    await Promise.allSettled(targets.map((client) => client.status !== "end" ? client.quit() : Promise.resolve()));
    publisher = null;
    subscriber = null;
  }
};

// src/worker.ts
var worker = null;
var shuttingDown = false;
async function bootstrap() {
  try {
    logger.info("\u{1F527} Inicializando servi\xE7os de background...");
    const dbContext = new DatabaseContext();
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
    worker = await startMailWorker(outboxRepository);
    logger.info("\u2705 Mail worker iniciado");
    const outboxProcessor = new OutboxProcessor(outboxRepository);
    await OutboxSignal.subscribe(async (publicId, event) => {
      await outboxProcessor.processSingleEvent(event);
    });
    startOutboxCron(outboxProcessor);
  } catch (error) {
    logger.fatal({ error }, "\u{1F525} Erro fatal ao iniciar os workers");
    process.exit(1);
  }
}
async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Recebido sinal ${signal}. Iniciando shutdown do worker...`);
  try {
    await OutboxSignal.disconnect();
    logger.info("OutboxSignal desconectado com sucesso");
  } catch (err) {
    logger.error(err, "Erro ao desconectar o OutboxSignal");
    exitCode = 1;
  }
  if (worker) {
    try {
      await worker.close();
      logger.info("Worker finalizado com sucesso");
    } catch (err) {
      logger.error(err, "Erro ao finalizar o worker");
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection");
});
process.on("uncaughtException", async (error) => {
  logger.fatal({ error }, "Uncaught Exception thrown");
  await shutdown("UNCAUGHT_EXCEPTION", 1);
});
bootstrap();
