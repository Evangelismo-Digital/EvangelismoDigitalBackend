"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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

// node_modules/fastify-plugin/lib/getPluginName.js
var require_getPluginName = __commonJS({
  "node_modules/fastify-plugin/lib/getPluginName.js"(exports2, module2) {
    "use strict";
    var fpStackTracePattern = /at\s{1}(?:.*\.)?plugin\s{1}.*\n\s*(.*)/;
    var fileNamePattern = /(\w*(\.\w*)*)\..*/;
    module2.exports = function getPluginName(fn) {
      if (fn.name.length > 0) return fn.name;
      const stackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 10;
      try {
        throw new Error("anonymous function");
      } catch (e) {
        Error.stackTraceLimit = stackTraceLimit;
        return extractPluginName(e.stack);
      }
    };
    function extractPluginName(stack) {
      const m = stack.match(fpStackTracePattern);
      return m ? m[1].split(/[/\\]/).slice(-1)[0].match(fileNamePattern)[1] : "anonymous";
    }
    module2.exports.extractPluginName = extractPluginName;
  }
});

// node_modules/fastify-plugin/lib/toCamelCase.js
var require_toCamelCase = __commonJS({
  "node_modules/fastify-plugin/lib/toCamelCase.js"(exports2, module2) {
    "use strict";
    module2.exports = function toCamelCase(name) {
      if (name[0] === "@") {
        name = name.slice(1).replace("/", "-");
      }
      return name.replace(/-(.)/g, function(match, g1) {
        return g1.toUpperCase();
      });
    };
  }
});

// node_modules/fastify-plugin/plugin.js
var require_plugin = __commonJS({
  "node_modules/fastify-plugin/plugin.js"(exports2, module2) {
    "use strict";
    var getPluginName = require_getPluginName();
    var toCamelCase = require_toCamelCase();
    var count = 0;
    function plugin(fn, options = {}) {
      let autoName = false;
      if (fn.default !== void 0) {
        fn = fn.default;
      }
      if (typeof fn !== "function") {
        throw new TypeError(
          `fastify-plugin expects a function, instead got a '${typeof fn}'`
        );
      }
      if (typeof options === "string") {
        options = {
          fastify: options
        };
      }
      if (typeof options !== "object" || Array.isArray(options) || options === null) {
        throw new TypeError("The options object should be an object");
      }
      if (options.fastify !== void 0 && typeof options.fastify !== "string") {
        throw new TypeError(`fastify-plugin expects a version string, instead got '${typeof options.fastify}'`);
      }
      if (!options.name) {
        autoName = true;
        options.name = getPluginName(fn) + "-auto-" + count++;
      }
      fn[Symbol.for("skip-override")] = options.encapsulate !== true;
      fn[Symbol.for("fastify.display-name")] = options.name;
      fn[Symbol.for("plugin-meta")] = options;
      if (!fn.default) {
        fn.default = fn;
      }
      const camelCase = toCamelCase(options.name);
      if (!autoName && !fn[camelCase]) {
        fn[camelCase] = fn;
      }
      return fn;
    }
    module2.exports = plugin;
    module2.exports.default = plugin;
    module2.exports.fastifyPlugin = plugin;
  }
});

// src/app.ts
var import_fastify = __toESM(require("fastify"));

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

// src/core/shared/error-handlers.ts
function ensureError(value) {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === "string") {
    return new Error(value);
  }
  if (typeof value === "object" && value !== null) {
    const raw = value;
    const message = typeof raw.message === "string" ? raw.message : JSON.stringify(raw);
    const error = new Error(message);
    Object.assign(error, raw);
    return error;
  }
  return new Error(String(value));
}

// src/core/shared/result.ts
var ok = (value) => ({
  success: true,
  value
});
var err = (error) => ({
  success: false,
  error: ensureError(error)
});
var errOf = (error) => ({
  success: false,
  error
});
function isOk(result) {
  return result.success;
}
function isErr(result) {
  return !result.success;
}

// src/repositories/prisma/prisma-users-repository.ts
var PrismaUsersRepository = class {
  constructor(errorMapper) {
    this.errorMapper = errorMapper;
  }
  async create(data) {
    try {
      const user = await prisma.user.create({
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
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async findBy(where) {
    try {
      const prismaWhere = {};
      if (where.id !== void 0) prismaWhere.id = where.id;
      if (where.publicId !== void 0) prismaWhere.publicId = where.publicId;
      if (where.email !== void 0) prismaWhere.email = where.email;
      if (where.username !== void 0) prismaWhere.username = where.username;
      if (where.cpf !== void 0) prismaWhere.cpf = where.cpf;
      if (where.token !== void 0) prismaWhere.token = where.token;
      const user = await prisma.user.findUnique({
        where: prismaWhere
      });
      return ok(user);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async findByToken({ token }) {
    try {
      const user = await prisma.user.findFirst({
        where: {
          token
        }
      });
      return ok(user);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async list() {
    try {
      const users = await prisma.user.findMany();
      return ok(users);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async search(query, page) {
    try {
      const users = await prisma.user.findMany({
        where: {
          name: {
            contains: query,
            mode: "insensitive"
          }
        },
        skip: (page - 1) * 20,
        take: 20
      });
      return ok(users);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async update(publicId, data) {
    try {
      const user = await prisma.user.update({
        where: { publicId },
        data
      });
      return ok(user);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async updatePassword(publicId, data) {
    try {
      const user = await prisma.user.update({
        where: { publicId },
        data
      });
      return ok(user);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async delete(publicId) {
    try {
      const user = await prisma.user.delete({
        where: {
          publicId
        }
      });
      return ok(user);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
};

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client2 = require("@prisma/client");

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
var SERVICE_BUSY_ERROR = {
  code: "SERVICE_BUSY",
  message: "Servi\xE7o temporariamente indispon\xEDvel devido ao limite de requisi\xE7\xF5es."
};
var PROVIDER_FAILURE_ERROR = {
  code: "PROVIDER_FAILURE",
  message: "Falha de sistema ao processar dados no provedor de servi\xE7os externos."
};
var DATABASE_QUERY_FAILURE_ERROR = {
  code: "DATABASE_QUERY_FAILURE",
  message: "Falha de sistema ao processar consulta no banco de dados."
};
var SERVICE_OVERLOAD_ERROR = {
  code: "SERVICE_OVERLOAD",
  message: "N\xFAmero de requisi\xE7\xF5es simult\xE2neas excedeu o limite de maxPendingFetches na mem\xF3ria cache do Redis."
};
var TIMEOUT_EXCEEDED_ERROR = {
  code: "TIMEOUT_EXCEEDED",
  message: "Tempo limite excedido ao buscar dados nos provedores externos."
};
var NO_GEO_PROVIDER_ERROR_MESSAGE = "Provedor resiliente de geolocaliza\xE7\xE3o requer pelo menos um provedor de geolocaliza\xE7\xE3o configurado.";
var NO_ADDRESS_PROVIDER_ERROR_MESSAGE = "Provedor resiliente de endere\xE7o requer pelo menos um provedor de endere\xE7o configurado.";

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
    if (error instanceof import_client2.Prisma.PrismaClientKnownRequestError) {
      const prismaError = error;
      const errorFactory = this.errorMapping[prismaError.code];
      if (errorFactory) {
        return errorFactory(prismaError);
      }
    }
    return new DatabaseQueryError(error);
  }
};

// src/errors/domain-error.ts
var DomainError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type, failureMode) {
    super(detail, type, failureMode);
  }
};

// src/messages/errors/use-cases/users/users-error-messages.ts
var USER_NOT_FOUND_ERROR = {
  code: "USER_NOT_FOUND",
  message: "Usu\xE1rio n\xE3o encontrado."
};
var USER_ALREADY_EXISTS_ERROR = {
  code: "USER_ALREADY_EXISTS",
  message: "Usu\xE1rio j\xE1 existe !"
};
var USER_NOT_CREATED_ERROR = {
  code: "USER_NOT_CREATED",
  message: "Falha ao criar o usu\xE1rio."
};
var USER_NOT_FOUND_FOR_PASSWORD_RESET_ERROR = {
  code: "USER_NOT_FOUND_FOR_PASSWORD_RESET",
  message: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
};
var INVALID_CREDENTIALS_ERROR = {
  code: "INVALID_CREDENTIALS",
  message: "Credenciais inv\xE1lidas!"
};
var INVALID_TOKEN_ERROR = {
  code: "INVALID_TOKEN",
  message: "Token inv\xE1lido ou expirado!"
};

// src/use-cases/errors/user-already-exists-error.ts
var UserAlreadyExistsError = class extends DomainError {
  constructor() {
    super(USER_ALREADY_EXISTS_ERROR, "CONFLICT" /* CONFLICT */);
  }
};

// src/use-cases/errors/user-not-found-error.ts
var UserNotFoundError = class extends DomainError {
  constructor() {
    super(USER_NOT_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */);
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

// src/use-cases/errors/invalid-token-error.ts
var InvalidTokenError = class extends DomainError {
  constructor() {
    super(INVALID_TOKEN_ERROR, "UNAUTHORIZED" /* UNAUTHORIZED */);
  }
};

// src/use-cases/users/reset-password.ts
var ResetPasswordUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({
    token,
    password
  }) {
    const userResult = await this.usersRepository.findByToken({ token });
    if (isErr(userResult)) {
      return userResult;
    }
    const userExists = userResult.value;
    if (!userExists || !userExists.tokenExpiresAt || userExists.tokenExpiresAt < /* @__PURE__ */ new Date()) {
      return errOf(new InvalidTokenError());
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
};

// src/use-cases/factories/make-reset-password-use-case.ts
function makeResetPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository);
  return resetPasswordUseCase;
}

// src/http/schemas/users/reset-password-schema.ts
var import_zod3 = require("zod");

// src/http/schemas/utils/password.ts
var import_zod2 = require("zod");

// src/core/constants/messages.ts
var messages = {
  validation: {
    invalidData: "Dados de registro inv\xE1lidos!",
    userAlreadyExists: "Usu\xE1rio j\xE1 existe !",
    invalidCpf: "CPF inv\xE1lido!",
    invalidJson: "O corpo da requisi\xE7\xE3o n\xE3o est\xE1 em formato JSON v\xE1lido. Verifique a estrutura dos dados enviados.",
    passwordTooShort: "A senha deve ter pelo menos 8 caracteres.",
    passwordTooLong: "A senha deve ter no m\xE1ximo 64 caracteres.",
    passwordUppercase: "A senha deve conter pelo menos uma letra mai\xFAscula.",
    passwordLowercase: "A senha deve conter pelo menos uma letra min\xFAscula.",
    passwordDigit: "A senha deve conter pelo menos um n\xFAmero.",
    passwordSpecial: "A senha deve conter pelo menos um caractere especial.",
    passwordNoSpaces: "A senha n\xE3o pode conter espa\xE7os."
  },
  errors: {
    internalServer: "Erro interno do servidor!",
    invalidCredentials: "Credenciais inv\xE1lidas!",
    resourceNotFound: "Recurso n\xE3o encontrado!",
    forbidden: "Acesso negado!",
    unauthorized: "N\xE3o autorizado!",
    invalidToken: "Token inv\xE1lido ou expirado!",
    passwordChangeRequired: "\xC9 necess\xE1rio alterar a senha antes de acessar o sistema!",
    formSubmissionFailed: "Falha ao enviar o formul\xE1rio.",
    createUserFailed: "Falha ao criar o usu\xE1rio.",
    operationAbortedError: "Opera\xE7\xE3o abortada pelo cache manager."
  },
  info: {
    passwordResetGeneric: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
  },
  email: {
    passwordRecoverySubject: "Recupera\xE7\xE3o de senha"
  }
};

// src/http/schemas/utils/password.ts
var passwordSchema = import_zod2.z.string().trim().min(8, { message: messages.validation.passwordTooShort }).max(64, { message: messages.validation.passwordTooLong }).regex(/[A-Z]/, { message: messages.validation.passwordUppercase }).regex(/[a-z]/, { message: messages.validation.passwordLowercase }).regex(/[0-9]/, { message: messages.validation.passwordDigit }).regex(/[\W_]/, { message: messages.validation.passwordSpecial }).refine((val) => !val.includes(" "), { message: messages.validation.passwordNoSpaces });

// src/http/schemas/users/reset-password-schema.ts
var resetPasswordSchema = import_zod3.z.object({
  password: passwordSchema,
  token: import_zod3.z.string()
});

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();
function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId;
}
function getUserId() {
  return asyncLocalStorage.getStore()?.userId;
}
function runWithRequestId(requestId, fn) {
  return asyncLocalStorage.run({ requestId }, fn);
}
function runWithUserContext(userId, fn) {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.userId = userId;
    return asyncLocalStorage.run(store, fn);
  }
  return fn();
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

// src/errors/http-errors/http-error-status.mapper.ts
var STATUS_MAP = {
  ["BAD_REQUEST" /* BAD_REQUEST */]: 400,
  ["UNAUTHORIZED" /* UNAUTHORIZED */]: 401,
  ["FORBIDDEN" /* FORBIDDEN */]: 403,
  ["NOT_FOUND" /* NOT_FOUND */]: 404,
  ["CONFLICT" /* CONFLICT */]: 409,
  ["UNPROCESSABLE_ENTITY" /* UNPROCESSABLE_ENTITY */]: 422,
  ["INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */]: 500,
  ["TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */]: 429,
  ["SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */]: 503
};
function toHttpStatus(type) {
  return STATUS_MAP[type] ?? 500;
}

// src/errors/http-errors/http-error-mapper.ts
var HttpErrorMapper = class {
  static map(error, reply) {
    if (error instanceof AppError) {
      const httpCode = toHttpStatus(error.type);
      return reply.status(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues
      });
    }
    throw error;
  }
};

// src/http/controllers/users/reset-password.controller.ts
async function resetPassword(request, reply) {
  const { password, token } = resetPasswordSchema.parse(request.body);
  const resetPasswordUseCase = makeResetPasswordUseCase();
  const result = await resetPasswordUseCase.execute({ password, token });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info({ userId: user.id }, "Password changed successfully!");
  return reply.status(200).send({ message: "Password changed successfully!" });
}

// src/http/schemas/users/register-schema.ts
var import_zod7 = require("zod");

// src/http/schemas/utils/cpf.ts
var import_zod4 = require("zod");
var import_cpf_cnpj_validator = require("cpf-cnpj-validator");
var cpfSchema = import_zod4.z.preprocess(
  (val) => typeof val === "string" ? val.replace(/\D/g, "") : val,
  import_zod4.z.string().length(11, { message: messages.validation.invalidCpf }).refine(import_cpf_cnpj_validator.cpf.isValid, { message: messages.validation.invalidCpf }).transform(import_cpf_cnpj_validator.cpf.format)
);

// src/http/schemas/utils/email.ts
var import_zod5 = __toESM(require("zod"));
var emailSchema = import_zod5.default.email().transform((email) => email.toLowerCase());

// src/http/schemas/utils/username.ts
var import_zod6 = __toESM(require("zod"));
var usernameSchema = import_zod6.default.string().trim().min(3).max(60);

// src/http/schemas/users/register-schema.ts
var registerSchema = import_zod7.z.object({
  name: import_zod7.z.string().trim().min(4).max(255),
  username: usernameSchema,
  email: emailSchema,
  cpf: cpfSchema,
  password: passwordSchema
});

// src/use-cases/users/register-user.ts
var import_bcryptjs2 = require("bcryptjs");

// src/use-cases/errors/user-not-created-error.ts
var UserNotCreatedError = class extends DomainError {
  constructor() {
    super(USER_NOT_CREATED_ERROR, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/use-cases/users/register-user.ts
var RegisterUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({
    name,
    email,
    cpf: cpf2,
    username,
    password,
    role
  }) {
    const userWithExistingEmail = await this.usersRepository.findBy({ email });
    if (isErr(userWithExistingEmail)) {
      return userWithExistingEmail;
    }
    if (userWithExistingEmail.value) {
      return errOf(new UserAlreadyExistsError());
    }
    const userWithExistingCpf = await this.usersRepository.findBy({ cpf: cpf2 });
    if (isErr(userWithExistingCpf)) {
      return userWithExistingCpf;
    }
    if (userWithExistingCpf.value) {
      return errOf(new UserAlreadyExistsError());
    }
    const userWithExistingUsername = await this.usersRepository.findBy({ username });
    if (isErr(userWithExistingUsername)) {
      return userWithExistingUsername;
    }
    if (userWithExistingUsername.value) {
      return errOf(new UserAlreadyExistsError());
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
      return errOf(new UserNotCreatedError());
    }
    return ok({ user });
  }
};

// src/use-cases/factories/make-register-user-use-case.ts
function makeRegisterUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const registerUseCase = new RegisterUserUseCase(usersRepository);
  return registerUseCase;
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
  const { name, email, cpf: cpf2, username, password } = registerSchema.parse(request.body);
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
  logger.info({ userId: user.publicId }, "Default user registered successfully!");
  return reply.status(201).send({ user: UserPresenter.toHTTP(user) });
}
async function registerAdmin(request, reply) {
  const { name, email, cpf: cpf2, username, password } = registerSchema.parse(request.body);
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
  logger.info({ userId: user.publicId }, "Admin user registered successfully!");
  return reply.status(201).send({ user: UserPresenter.toHTTP(user) });
}

// src/http/middlewares/verify-jwt.middleware.ts
async function verifyJwt(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: messages.errors.unauthorized ?? "Unauthorized" });
  }
}

// src/http/middlewares/verify-user-role.middleware.ts
function verifyUserRole(allowedRoles) {
  return async (request, reply) => {
    const { role } = request.user;
    if (!role) {
      return reply.status(401).send({ message: messages.errors.unauthorized ?? "Unauthorized" });
    }
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({ message: messages.errors.forbidden ?? "Forbidden" });
    }
  };
}

// src/http/controllers/users/authenticate-user.controller.ts
var import_client4 = require("@prisma/client");

// src/http/schemas/users/authenticate-schema.ts
var import_zod8 = require("zod");
var authenticateSchema = import_zod8.z.object({
  login: import_zod8.z.union([usernameSchema, emailSchema]),
  password: import_zod8.z.string().trim().min(4)
});

// src/use-cases/users/authenticate-user.ts
var import_client3 = require("@prisma/client");

// src/use-cases/errors/invalid-credentials-error.ts
var InvalidCredentialsError = class extends DomainError {
  constructor() {
    super(INVALID_CREDENTIALS_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/users/authenticate-user.ts
var import_bcryptjs3 = require("bcryptjs");
var AuthenticateUserUseCase = class {
  constructor(usersRepository, authenticationAuditUseCase) {
    this.usersRepository = usersRepository;
    this.authenticationAuditUseCase = authenticationAuditUseCase;
  }
  async execute({
    login,
    password,
    auditContext
  }) {
    let userResult;
    if (emailSchema.safeParse(login).success) {
      userResult = await this.usersRepository.findBy({ email: login });
    } else {
      userResult = await this.usersRepository.findBy({ username: login });
    }
    if (isErr(userResult)) {
      return userResult;
    }
    const user = userResult.value;
    if (!user) {
      await this.authenticationAuditUseCase.execute({
        ...auditContext,
        status: import_client3.AuthenticationStatus.USER_NOT_EXISTS
      });
      return errOf(new InvalidCredentialsError());
    }
    const hashToCompare = user.passwordHash;
    const doesPasswordMatch = await (0, import_bcryptjs3.compare)(password, hashToCompare);
    if (!doesPasswordMatch) {
      await this.authenticationAuditUseCase.execute({
        ...auditContext,
        status: import_client3.AuthenticationStatus.INCORRECT_PASSWORD,
        userId: user.id
      });
      return errOf(new InvalidCredentialsError());
    }
    await this.authenticationAuditUseCase.execute({
      ...auditContext,
      status: import_client3.AuthenticationStatus.SUCCESS,
      userId: user.id
    });
    return ok({ user });
  }
};

// src/repositories/prisma/prisma-authentication-audit-repository.ts
var PrismaAuthenticationAuditRepository = class {
  async create(data) {
    try {
      const audit = await prisma.authenticationAudit.create({
        data: {
          status: data.status,
          userId: data.userId ?? null,
          ipAddress: data.ipAddress ?? null,
          remotePort: data.remotePort ?? null,
          userAgent: data.userAgent ?? null,
          origin: data.origin ?? null
        }
      });
      return ok(audit);
    } catch (error) {
      return errOf(new DatabaseQueryError(error));
    }
  }
};

// src/use-cases/authentication-audit/authentication-audit.ts
var AuthenticationAuditUseCase = class {
  constructor(authenticationAuditRepository) {
    this.authenticationAuditRepository = authenticationAuditRepository;
  }
  async execute(data) {
    try {
      await this.authenticationAuditRepository.create(data);
    } catch (error) {
      logger.error(error, "Falha ao criar registro de auditoria de autentica\xE7\xE3o");
    }
  }
};

// src/use-cases/factories/make-authentication-audit-use-case.ts
function makeAuthenticationAuditUseCase() {
  const authenticationAuditRepository = new PrismaAuthenticationAuditRepository();
  const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository);
  return authenticationAuditUseCase;
}

// src/use-cases/factories/make-authenticate-user-use-case.ts
function makeAuthenticateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase();
  const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase);
  return authenticateUserUseCase;
}

// src/http/controllers/users/authenticate-user.controller.ts
var import_zod9 = require("zod");
function getAuthenticationAuditContext(request) {
  return {
    ipAddress: request.ip,
    remotePort: request.socket.remotePort?.toString() ?? null,
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
    origin: typeof request.headers.origin === "string" ? request.headers.origin : null
  };
}
async function authenticateUser(request, reply) {
  const authenticationAuditUseCase = makeAuthenticationAuditUseCase();
  const auditContext = getAuthenticationAuditContext(request);
  const parsedBody = authenticateSchema.safeParse(request.body);
  if (!parsedBody.success) {
    await authenticationAuditUseCase.execute({
      ...auditContext,
      status: import_client4.AuthenticationStatus.INVALID_REQUEST
    });
    return reply.status(400).send({ message: messages.validation.invalidData, details: import_zod9.z.treeifyError(parsedBody.error) });
  }
  const authenticateUserUseCase = makeAuthenticateUserUseCase();
  const result = await authenticateUserUseCase.execute({
    login: parsedBody.data.login,
    password: parsedBody.data.password,
    auditContext
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("User authenticated successfully!");
  const token = await reply.jwtSign({ sub: user.publicId, role: user.role }, { expiresIn: "1d" });
  return reply.status(200).send({ token, user: UserPresenter.toHTTP(user) });
}

// src/use-cases/users/delete-user.ts
var DeleteUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({ publicId }) {
    const userResult = await this.usersRepository.findBy({ publicId });
    if (isErr(userResult)) {
      return userResult;
    }
    const userExists = userResult.value;
    if (!userExists) {
      return errOf(new UserNotFoundError());
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
  const deleteUserUseCase = new DeleteUserUseCase(usersRepository);
  return deleteUserUseCase;
}

// src/http/schemas/utils/public-id-schema.ts
var import_zod10 = require("zod");
var publicIdSchema = import_zod10.z.object({
  publicId: import_zod10.z.uuid()
});

// src/http/controllers/users/delete-user.controller.ts
async function deleteUser(request, reply) {
  const deleteUserUseCase = makeDeleteUserUseCase();
  const result = await deleteUserUseCase.execute({
    publicId: request.user.sub
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  logger.info("User deleted successfully!");
  return reply.status(204).send();
}
async function deleteUserByPublicId(request, reply) {
  const { publicId } = publicIdSchema.parse(request.params);
  const deleteUserUseCase = makeDeleteUserUseCase();
  const result = await deleteUserUseCase.execute({
    publicId
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  logger.info({ targetId: publicId }, "User deleted successfully!");
  return reply.status(204).send();
}

// src/http/schemas/users/forgot-password-schema.ts
var import_zod11 = require("zod");
var forgotPasswordSchema = import_zod11.z.object({
  email: emailSchema
});

// src/use-cases/users/forgot-password.ts
var import_crypto = require("crypto");

// src/use-cases/errors/user-not-found-for-password-reset-error.ts
var UserNotFoundForPasswordResetError = class extends DomainError {
  constructor() {
    super(USER_NOT_FOUND_FOR_PASSWORD_RESET_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/users/forgot-password.ts
var EXPIRES_IN_MINUTES = 15;
var TOKEN_LENGTH = 32;
var ForgotPasswordUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({ email }) {
    let userExists = null;
    if (emailSchema.safeParse(email).success) {
      const userResult = await this.usersRepository.findBy({ email });
      if (isErr(userResult)) {
        return userResult;
      }
      userExists = userResult.value;
    }
    if (!userExists) {
      return errOf(new UserNotFoundForPasswordResetError());
    }
    const passwordToken = (0, import_crypto.randomBytes)(TOKEN_LENGTH).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60 * 1e3);
    const tokenData = {
      token: passwordToken,
      tokenExpiresAt
    };
    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      ...tokenData
    });
    if (isErr(updateResult)) {
      return updateResult;
    }
    const user = updateResult.value;
    if (!user) {
      return errOf(new UserNotFoundForPasswordResetError());
    }
    return ok({
      user,
      token: passwordToken
    });
  }
};

// src/use-cases/factories/make-forgot-password-use-case.ts
function makeForgotPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository);
  return forgotPasswordUseCase;
}

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

// src/templates/forgot-password/forgot-password-text.ts
function forgotPasswordTextTemplate(userName, token) {
  const url = `${env.FRONTEND_URL}/reset-password/${token}`;
  const appName = env.APP_NAME;
  return `
Ol\xE1, ${userName}!

Recebemos uma solicita\xE7\xE3o para redefinir a sua senha. Para continuar, acesse o link abaixo:

${url}

Se voc\xEA n\xE3o solicitou a recupera\xE7\xE3o de senha, ignore este e-mail.

Atenciosamente,
Equipe ${appName}
  `.trim();
}

// src/templates/forgot-password/forgot-password-html.ts
function forgotPasswordHtmlTemplate(userName, token) {
  const url = `${env.FRONTEND_URL}/reset-password/${token}`;
  const appName = env.APP_NAME;
  return `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <h2>Ol\xE1, ${userName}!</h2>
      <p>
        Recebemos uma solicita\xE7\xE3o para redefinir a sua senha.<br>
        Para continuar, clique no bot\xE3o abaixo:
      </p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${url}" style="background: #1976d2; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Redefinir senha
        </a>
      </p>
      <p>
        Ou copie e cole este link no seu navegador:<br>
        <a href="${url}">${url}</a>
      </p>
      <p>
        Se voc\xEA n\xE3o solicitou a recupera\xE7\xE3o de senha, ignore este e-mail.
      </p>
      <p>
        Atenciosamente,<br>
        Equipe ${appName}
      </p>
    </div>
  `;
}

// src/http/controllers/users/forgot-password.controller.ts
async function forgotPassword(request, reply) {
  const { email } = forgotPasswordSchema.parse(request.body);
  if (!email) {
    return reply.status(200).send({ message: messages.info.passwordResetGeneric });
  }
  const forgotPasswordUseCase = makeForgotPasswordUseCase();
  const result = await forgotPasswordUseCase.execute({ email });
  if (isErr(result)) {
    if (result.error instanceof UserNotFoundForPasswordResetError) {
      return reply.status(200).send({ message: result.error.message });
    }
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user, token } = result.value;
  const sendEmailUseCase = makeSendEmailUseCase();
  await sendEmailUseCase.execute({
    to: user.email,
    subject: messages.email.passwordRecoverySubject,
    message: forgotPasswordTextTemplate(user.name, token),
    html: forgotPasswordHtmlTemplate(user.name, token)
  });
  logger.info({ targetId: user.publicId }, "Password reset email sent");
  return reply.status(200).send({ message: messages.info.passwordResetGeneric });
}

// src/use-cases/users/get-user-profile.ts
var GetUserProfileUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({ publicId }) {
    const userResult = await this.usersRepository.findBy({ publicId });
    if (isErr(userResult)) {
      return userResult;
    }
    const user = userResult.value;
    if (!user) {
      return errOf(new UserNotFoundError());
    }
    return ok({ user });
  }
};

// src/use-cases/factories/make-get-user-profile-use-case.ts
function makeGetUserProfileUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const getUserProfileUseCase = new GetUserProfileUseCase(usersRepository);
  return getUserProfileUseCase;
}

// src/http/controllers/users/get-user-profile.controller.ts
async function getUserProfile(request, reply) {
  const getUserProfileUseCase = makeGetUserProfileUseCase();
  const data = { publicId: String(request.user?.sub) };
  const { publicId } = publicIdSchema.parse(data);
  const result = await getUserProfileUseCase.execute({ publicId });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("User profile retrieved successfully!");
  return reply.status(200).send(UserPresenter.toHTTP(user));
}
async function getUserByPublicId(request, reply) {
  const { publicId } = publicIdSchema.parse(request.params);
  const getUserProfileUseCase = makeGetUserProfileUseCase();
  const result = await getUserProfileUseCase.execute({ publicId });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("User retrieved successfully!");
  return reply.status(200).send(UserPresenter.toHTTP(user));
}

// src/use-cases/users/update-user.ts
var UpdateUserUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
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
      return errOf(new UserNotFoundError());
    }
    const data = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (username) data.username = username;
    data.updatedAt = /* @__PURE__ */ new Date();
    if (email) {
      const emailResult = await this.usersRepository.findBy({ email });
      if (isErr(emailResult)) {
        return emailResult;
      }
      const userWithExistingEmail = emailResult.value;
      if (userWithExistingEmail && userWithExistingEmail.publicId !== userToBeUpdated.publicId) {
        return errOf(new UserAlreadyExistsError());
      }
    }
    if (username) {
      const usernameResult = await this.usersRepository.findBy({ username });
      if (isErr(usernameResult)) {
        return usernameResult;
      }
      const usernameWithExistingUsername = usernameResult.value;
      if (usernameWithExistingUsername && usernameWithExistingUsername.publicId !== userToBeUpdated.publicId) {
        return errOf(new UserAlreadyExistsError());
      }
    }
    const updateResult = await this.usersRepository.update(userToBeUpdated.publicId, {
      ...data
    });
    if (isErr(updateResult)) {
      return updateResult;
    }
    const user = updateResult.value;
    return ok({ user });
  }
};

// src/use-cases/factories/make-update-user-use-case.ts
function makeUpdateUserUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const updateUserUseCase = new UpdateUserUseCase(usersRepository);
  return updateUserUseCase;
}

// src/http/schemas/users/update-schema.ts
var import_zod12 = require("zod");
var updateSchema = import_zod12.z.object({
  name: import_zod12.z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional()
});

// src/http/controllers/users/update-user.controller.ts
async function updateUser(request, reply) {
  const bodyParse = updateSchema.safeParse(request.body);
  if (!bodyParse.success) {
    return reply.status(400).send({
      message: "Dados de registro inv\xE1lidos!"
    });
  }
  const { name, username, email } = bodyParse.data;
  const authUser = request.user;
  const publicId = authUser?.publicId ?? authUser?.sub;
  if (!publicId) {
    return reply.status(401).send({ message: messages.errors.unauthorized ?? "Unauthorized" });
  }
  const fallbackValid = publicIdSchema.safeParse({ publicId });
  if (!fallbackValid.success) {
    return reply.status(400).send({
      message: "Par\xE2metros inv\xE1lidos!"
    });
  }
  const updateUserUseCase = makeUpdateUserUseCase();
  const result = await updateUserUseCase.execute({
    publicId,
    name,
    email,
    username
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { user } = result.value;
  logger.info("User updated successfully!");
  return reply.status(200).send(UserPresenter.toHTTP(user));
}

// src/http/controllers/users/users.routes.ts
var import_client5 = require("@prisma/client");

// src/use-cases/users/list-users.ts
var ListUsersUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute() {
    const listResult = await this.usersRepository.list();
    if (isErr(listResult)) {
      return listResult;
    }
    const users = listResult.value;
    if (!users || users.length === 0) {
      return errOf(new UserNotFoundError());
    }
    return ok({ users });
  }
};

// src/use-cases/factories/make-list-users-use-case.ts
function makeListUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const listUsersUseCase = new ListUsersUseCase(usersRepository);
  return listUsersUseCase;
}

// src/http/controllers/users/list-users.controller.ts
async function listUsers(_request, reply) {
  const listUsersUseCase = makeListUsersUseCase();
  const result = await listUsersUseCase.execute();
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { users } = result.value;
  logger.info("Users retrieved successfully!");
  return reply.status(200).send({ users: UserPresenter.toHTTP(users) });
}

// src/use-cases/users/search-users-use-case.ts
var SearchUsersUseCase = class {
  constructor(usersRepository) {
    this.usersRepository = usersRepository;
  }
  async execute({ query, page }) {
    const searchResult = await this.usersRepository.search(query, page);
    if (isErr(searchResult)) {
      return searchResult;
    }
    const users = searchResult.value;
    if (!users || users.length === 0) {
      return errOf(new UserNotFoundError());
    }
    return ok({ users });
  }
};

// src/use-cases/factories/make-search-users-use-case.ts
function makeSearchUsersUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const searchUsersUseCase = new SearchUsersUseCase(usersRepository);
  return searchUsersUseCase;
}

// src/http/controllers/users/search-users.controller.ts
async function searchUsersController(request, reply) {
  const { query, page } = request.query;
  const searchQuery = query || "";
  const pageNumber = page ? parseInt(page, 10) : 1;
  if (isNaN(pageNumber) || pageNumber < 1) {
    return reply.status(400).send({ message: "N\xFAmero de p\xE1gina inv\xE1lido. A p\xE1gina deve ser um n\xFAmero inteiro maior que zero." });
  }
  const searchUsersUseCase = makeSearchUsersUseCase();
  const result = await searchUsersUseCase.execute({
    query: searchQuery,
    page: pageNumber
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { users } = result.value;
  logger.info(`Encontrados ${users.length} usu\xE1rios para a consulta: "${searchQuery}" na p\xE1gina ${pageNumber}.`);
  return reply.status(200).send({ users });
}

// src/http/policies/rate-limit.ts
var HTTP_RATE_LIMIT_POLICIES = {
  global: {
    max: env.HTTP_RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW
  },
  auth: {
    session: {
      max: 30,
      timeWindow: "1 minute"
    },
    register: {
      max: 1e3,
      timeWindow: "1 minute"
    },
    registerAdmin: {
      max: 15,
      timeWindow: "1 hour"
    },
    forgotPassword: {
      max: 100,
      timeWindow: "1 hour"
    },
    resetPassword: {
      max: 200,
      timeWindow: "1 hour"
    }
  },
  users: {
    list: {
      max: 20,
      timeWindow: "1 hour"
    },
    delete: {
      max: 10,
      timeWindow: "1 hour"
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
      max: 60,
      timeWindow: "1 minute"
    }
  },
  health: {
    check: {
      max: 120,
      timeWindow: "1 minute"
    }
  }
};

// src/http/controllers/users/users.routes.ts
async function usersRoutes(app2) {
  app2.post(
    "/register/admin",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.registerAdmin }
    },
    registerAdmin
  );
  app2.post("/register", { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register } }, register);
  app2.post(
    "/sessions",
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.session }
    },
    authenticateUser
  );
  app2.post("/forgot-password", { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.forgotPassword } }, forgotPassword);
  app2.patch("/reset-password", { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.resetPassword } }, resetPassword);
  app2.patch(
    "/me",
    {
      onRequest: [verifyJwt]
    },
    updateUser
  );
  app2.get(
    "/me",
    {
      onRequest: [verifyJwt]
    },
    getUserProfile
  );
  app2.delete(
    "/me",
    {
      onRequest: [verifyJwt]
    },
    deleteUser
  );
  app2.get(
    "/",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list }
    },
    listUsers
  );
  app2.get("/search", { onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])] }, searchUsersController);
  app2.patch("/:publicId", { onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])] }, updateUser);
  app2.delete(
    "/:publicId",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete }
    },
    deleteUserByPublicId
  );
  app2.get("/:publicId", { onRequest: [verifyJwt, verifyUserRole([import_client5.UserRole.ADMIN])] }, getUserByPublicId);
}

// src/lib/logger/helpers.ts
function logError(error, context = {}, msg = "Unexpected error") {
  if (error instanceof Error) {
    logger.error(
      {
        message: error.message,
        stack: error.stack,
        ...context
      },
      msg
    );
  } else {
    logger.error(
      {
        message: "Unknown error",
        ...context
      },
      msg
    );
  }
}

// src/http/controllers/health-check/health-check.controller.ts
async function healthCheck(_request, reply) {
  const memoryUsage = process.memoryUsage();
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const uptime = process.uptime();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const duration = Date.now() - startTime;
    logger.info({ uptime, duration }, "Healthcheck successful");
    return reply.status(200).send({
      status: "ok",
      uptime,
      timestamp,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, { duration }, "Healthcheck failed");
    return reply.status(500).send({ status: "error", message: "Internal healthcheck error" });
  }
}

// src/http/controllers/health-check/health-check.routes.ts
async function healthCheckRoutes(app2) {
  app2.get("/", { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.health.check } }, healthCheck);
}

// src/http/schemas/forms/forms-schema.ts
var import_zod13 = require("zod");
var formsSchema = import_zod13.z.object({
  name: import_zod13.z.string().trim().min(4).max(255),
  lastName: import_zod13.z.string().trim().min(4).max(255),
  email: emailSchema,
  decisaoPorCristo: import_zod13.z.boolean(),
  location: import_zod13.z.string().optional()
});

// src/use-cases/outbox-event/outbox-event-use-case.ts
var OutboxEventUseCase = class {
  constructor(outboxRepository) {
    this.outboxRepository = outboxRepository;
  }
  async register(form) {
    const payload = {
      name: form.name,
      email: form.email,
      lastName: form.lastName,
      decisaoPorCristo: form.decisaoPorCristo,
      location: form.location || null
    };
    const outboxEvent = await this.outboxRepository.create({
      status: "PENDING" /* PENDING */,
      type: "FormSubmissionCreated",
      payload
    });
    return outboxEvent;
  }
};

// src/lib/async-local-storage/index.ts
var import_node_async_hooks2 = require("async_hooks");
var asyncLocalStorage2 = new import_node_async_hooks2.AsyncLocalStorage();

// src/messages/errors/system/async-local-storage.ts
var ASYNC_LOCAL_STORAGE_NOT_INITIALIZED_ERROR = {
  message: "Async Local Storage is not initialized.",
  code: "ASYNC_LOCAL_STORAGE_NOT_INITIALIZED"
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
    super(ASYNC_LOCAL_STORAGE_NOT_INITIALIZED_ERROR, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

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

// src/messages/errors/use-cases/forms/forms-error-messages.ts
var FORM_SUBMISSION_ERROR = {
  code: "FORM_SUBMISSION_ERROR",
  message: "Ocorreu um erro ao submeter o formul\xE1rio."
};
var FORM_ALREADY_EXISTS_ERROR = {
  code: "FORM_ALREADY_EXISTS",
  message: "J\xE1 existe um formul\xE1rio submetido com este email."
};
var FORM_NOT_FOUND_ERROR = {
  code: "FORM_NOT_FOUND",
  message: "Nenhum formul\xE1rio encontrado para o email fornecido."
};

// src/use-cases/errors/forms/forms-not-found-error.ts
var FormsNotFoundError = class extends DomainError {
  constructor() {
    super(FORM_NOT_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/repositories/prisma/prisma-forms-repository.ts
var PrismaFormsRepository = class {
  constructor(dbContext, errorMapper) {
    this.dbContext = dbContext;
    this.errorMapper = errorMapper;
  }
  async create(data) {
    try {
      const formSubmission2 = await this.dbContext.client.formSubmission.create({
        data
      });
      return ok(formSubmission2);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
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
        return errOf(new FormsNotFoundError());
      }
      return ok(formSubmission2);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
};

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

// src/use-cases/decorators/transactional-use-case.decorator.ts
var RollbackTransactionError = class extends Error {
  constructor(result) {
    super("Rollback requested by domain logic");
    this.result = result;
  }
};
var TransactionalUseCaseDecorator = class {
  constructor(useCase, dbContext) {
    this.useCase = useCase;
    this.dbContext = dbContext;
  }
  async execute(request) {
    try {
      return await this.dbContext.runInTransaction(async () => {
        const result = await this.useCase.execute(request);
        if (result.success === false) {
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

// src/use-cases/errors/forms/forms-already-exists-error.ts
var FormsAlreadyExistsError = class extends DomainError {
  constructor() {
    super(FORM_ALREADY_EXISTS_ERROR, "CONFLICT" /* CONFLICT */);
  }
};

// src/use-cases/forms/forms-submission.ts
var FormsSubmissionUseCase = class {
  constructor(formsSubmissionRepository, eventRegistration) {
    this.formsSubmissionRepository = formsSubmissionRepository;
    this.eventRegistration = eventRegistration;
  }
  async execute(request) {
    const findEmailResult = await this.formsSubmissionRepository.findByEmail(request.email);
    if (findEmailResult.success === true) {
      return err(new FormsAlreadyExistsError());
    }
    if (!(findEmailResult.error instanceof FormsNotFoundError)) {
      return findEmailResult;
    }
    const formSubmissionResult = await this.formsSubmissionRepository.create({
      name: request.name,
      lastName: request.lastName,
      email: request.email,
      decisaoPorCristo: request.decisaoPorCristo,
      location: request.location || void 0
    });
    if (formSubmissionResult.success === false) {
      return formSubmissionResult;
    }
    const formSubmission2 = formSubmissionResult.value;
    const sanitizedFormSubmission = {
      name: formSubmission2.name,
      lastName: formSubmission2.lastName,
      email: formSubmission2.email,
      decisaoPorCristo: formSubmission2.decisaoPorCristo,
      location: formSubmission2.location ?? null
    };
    const outboxEvent = await this.eventRegistration.register(sanitizedFormSubmission);
    if (outboxEvent.success === false) {
      return outboxEvent;
    }
    return ok({
      sanitizedFormSubmission,
      outboxEvent: outboxEvent.value
    });
  }
};

// src/use-cases/errors/forms/forms-submission-error.ts
var FormsSubmissionError = class extends DomainError {
  constructor() {
    super(FORM_SUBMISSION_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/repositories/prisma/errors/forms-error-mapping.ts
var formsPrismaErrorMapping = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError()
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

// src/core/constants/redis/redis-channells.ts
var REDIS_CHANNELS = {
  OUTBOX_SIGNAL: "outbox-signal"
};

// src/lib/infra/events/outbox-signal.ts
var import_ioredis = __toESM(require("ioredis"));
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
    publisher = new import_ioredis.default({
      ...baseConfig2,
      enableOfflineQueue: true,
      commandTimeout: 2e3
    });
    publisher.on("connect", () => logger.info("\u2705 Redis publisher conectado ao outbox-signal"));
    publisher.on("error", (err2) => logger.error({ err: err2 }, "\u274C Redis publisher error no outbox-signal"));
    publisher.on("close", () => logger.warn("\u26A0\uFE0F Redis publisher connection fechada para outbox-signal"));
  }
  return publisher;
}
function getSubscriber() {
  if (!subscriber) {
    subscriber = new import_ioredis.default({
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
    subscriber.on("error", (err2) => logger.error({ err: err2 }, "\u274C Redis subscriber error no outbox-signal"));
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
    } catch (err2) {
      logger.warn(
        { err: err2 },
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
        } catch (err2) {
          logger.error({ err: err2, publicId: message }, "Erro ao processar sinal de Outbox");
        }
      };
      client.on("message", activeMessageListener);
      await client.subscribe(REDIS_CHANNELS.OUTBOX_SIGNAL);
    } catch (err2) {
      logger.error({ err: err2 }, "\u274C Erro ao subscrever ao canal de OutboxSignal");
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

// src/http/controllers/forms/form.controller.ts
async function formSubmission(request, reply) {
  const data = formsSchema.parse(request.body);
  const formSubmissionUseCase = makeFormSubmissionUseCase();
  const result = await formSubmissionUseCase.execute({
    ...data
  });
  if (result.success === false) {
    return HttpErrorMapper.map(result.error, reply);
  }
  const { sanitizedFormSubmission, outboxEvent } = result.value;
  OutboxSignal.publishNewItem(outboxEvent.publicId, outboxEvent).catch(() => {
    logger.error(
      { publicId: outboxEvent.publicId },
      "Prosseguindo com a resposta, mas falha acorreu ao publicar o evento na fila"
    );
  });
  logger.info({ sanitizedFormSubmission }, "Formul\xE1rio recebido com sucesso");
  return reply.status(201).send({
    sanitizedFormSubmission
  });
}

// src/http/controllers/forms/forms.routes.ts
async function formsRoutes(app2) {
  app2.post("/submit-form", { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.forms.submit } }, formSubmission);
}

// src/http/schemas/utils/cep.ts
var import_zod14 = require("zod");
var cepSchema = import_zod14.z.string().regex(/^\d{5}-?\d{3}$/, {
  message: "CEP inv\xE1lido. Use o formato 12345-678 ou 12345678."
});

// src/lib/redis/connections/redis-bullMQ-connection.ts
var import_ioredis2 = __toESM(require("ioredis"));

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
  const err2 = error ?? {};
  const message = (err2.message ?? "").toUpperCase();
  const code = (err2.code ?? "").toUpperCase();
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
    const err2 = error ?? {};
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
          errorCode: err2.code,
          errorName: err2.name,
          errorMessage: err2.message
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
          errorCode: err2.code,
          errorName: err2.name,
          errorMessage: err2.message,
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

// src/lib/redis/connections/redis-cache-connection.ts
var import_ioredis3 = __toESM(require("ioredis"));
function createRedisCacheConnection() {
  const redis = new import_ioredis3.default({
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
var import_ioredis4 = __toESM(require("ioredis"));
function createRedisRateLimiterConnection() {
  const redis = new import_ioredis4.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || void 0,
    // === DIFERENÇAS CHAVE PARA O RATE LIMITER ===
    // 1. Timeout agressivo. Rate Limit tem que ser instantâneo.
    // Se demorar mais que 100ms, aborta para não segurar a API.
    commandTimeout: env.NODE_ENV === "test" ? 1e3 : 100,
    // Cache costuma ser 1000ms
    // 2. SEM fila offline.
    // Se a conexão cair, falhe o comando imediatamente (throw error).
    // Não queremos acumular verificações de limite na RAM.
    enableOfflineQueue: false,
    // 3. Poucas retentativas.
    // Se falhou, falhou. O 'Fail-Open' na classe RateLimiter vai lidar com isso.
    maxRetriesPerRequest: 0
  });
  const outageLogger = new RedisOutageLogger({
    subsystem: "rate-limiter",
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
        subsystem: "rate-limiter",
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        errorCode: error?.code,
        errorMessage: error?.message,
        stack: error?.stack
      },
      "Unexpected Redis Rate Limiter connection error"
    );
  });
  redis.on("close", () => {
    outageLogger.onOutage("close");
  });
  return redis;
}

// src/lib/redis/clients/clients.ts
var redisCacheInstance = null;
var redisRateLimitInstance = null;
var redisForQueueInstance = null;
function getRedisCache() {
  if (!redisCacheInstance) {
    redisCacheInstance = createRedisCacheConnection();
  }
  return redisCacheInstance;
}
function getRedisRateLimit() {
  if (!redisRateLimitInstance) {
    redisRateLimitInstance = createRedisRateLimiterConnection();
  }
  return redisRateLimitInstance;
}
async function closeAllRedisConnections() {
  const targets = [redisCacheInstance, redisRateLimitInstance, redisForQueueInstance].filter(
    (connection) => connection !== null
  );
  await Promise.all(targets.map((connection) => connection.quit()));
  redisCacheInstance = null;
  redisRateLimitInstance = null;
  redisForQueueInstance = null;
}

// src/messages/errors/use-cases/churches/churches-error-messages.ts
var CHURCH_NOT_FOUND_ERROR = {
  code: "CHURCH_NOT_FOUND",
  message: "Igreja n\xE3o encontrada."
};
var CHURCH_ALREADY_EXISTS_ERROR = {
  code: "CHURCH_ALREADY_EXISTS",
  message: "J\xE1 existe uma igreja cadastrada com este nome e/ou coordenadas"
};
var INVALID_CEP_ERROR = {
  code: "INVALID_CEP",
  message: "O CEP fornecido n\xE3o existe."
};
var COORDINATES_NOT_FOUND_ERROR = {
  code: "COORDINATES_NOT_FOUND",
  message: "Coordenadas n\xE3o encontradas para o endere\xE7o fornecido."
};
var NO_ADDRESS_PROVIDED_ERROR = {
  code: "NO_ADDRESS_PROVIDED",
  message: "Nenhum endere\xE7o fornecido para convers\xE3o de CEP."
};
var LATITUDE_OUT_OF_RANGE_ERROR = {
  code: "LATITUDE_OUT_OF_RANGE",
  message: "A Latitude deve estar entre -90 e 90 graus."
};
var LONGITUDE_OUT_OF_RANGE_ERROR = {
  code: "LONGITUDE_OUT_OF_RANGE",
  message: "A longitude deve estar entre -180 e 180 graus."
};
var CREATE_CHURCH_FAILED_ERROR = {
  code: "CREATE_CHURCH_FAILED",
  message: "Falha ao criar a igreja."
};
var EMPTY_CHURCH_LIST_ERROR = {
  code: "EMPTY_CHURCH_LIST",
  message: "Lista de igrejas vazia!"
};
var NO_NEARBY_CHURCHES_FOUND_ERROR = {
  code: "NO_NEARBY_CHURCHES_FOUND",
  message: "Nenhuma igreja encontrada nas proximidades."
};
var CEP_TO_LAT_LON_ERROR = {
  code: "CEP_TO_LAT_LON_FAILED",
  message: "Falha ao processar o CEP"
};

// src/use-cases/errors/coordinates-not-found-error.ts
var CoordinatesNotFoundError = class extends DomainError {
  constructor() {
    super(COORDINATES_NOT_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/invalid-cep-error.ts
var InvalidCepError = class extends DomainError {
  constructor(cep) {
    const detail = {
      code: INVALID_CEP_ERROR.code,
      message: cep ? `O CEP fornecido ${cep} n\xE3o existe.` : INVALID_CEP_ERROR.message
    };
    super(detail, "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/cep-to-lat-lon-error.ts
var CepToLatLonError = class extends DomainError {
  constructor(cep) {
    super(
      {
        code: CEP_TO_LAT_LON_ERROR.code,
        message: `${CEP_TO_LAT_LON_ERROR.message} ${cep}.`
      },
      "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */
    );
  }
};

// src/lib/infra/cache/resilient-cache.ts
var import_crypto2 = __toESM(require("crypto"));

// src/errors/infrastructure/service-overload-error.ts
var ServiceOverloadError = class extends InfrastructureError {
  constructor() {
    super(SERVICE_OVERLOAD_ERROR, void 0, "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */);
    this.name = "ServiceOverloadError";
  }
};

// src/errors/infrastructure/timeout-exceeded-error.ts
var TimeoutExceededError = class extends InfrastructureError {
  constructor(reason) {
    super(TIMEOUT_EXCEEDED_ERROR, reason, "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */, "RETRYABLE" /* RETRYABLE */);
    this.name = "TimeoutExceededError";
  }
};

// src/errors/infrastructure/provider-failure-error.ts
var ProviderFailureError = class extends InfrastructureError {
  constructor(provider, layer, originalError) {
    super(
      {
        code: PROVIDER_FAILURE_ERROR.code,
        message: PROVIDER_FAILURE_ERROR.message,
        providerContext: { provider, layer }
      },
      originalError,
      "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
      "RETRYABLE" /* RETRYABLE */
    );
    this.name = "ProviderFailureError";
  }
};

// src/lib/infra/cache/resilient-cache.ts
var ResilientCache = class {
  constructor(redis, options) {
    this.redis = redis;
    this.options = options;
    this.MAX_PENDING = options.maxPendingFetches ?? 1e3;
    this.FETCH_TIMEOUT = options.fetchTimeoutMs ?? 12e3;
    this.JITTER_PERCENTAGE = options.ttlJitterPercentage ?? 0.05;
  }
  pendingFetches = /* @__PURE__ */ new Map();
  MAX_PENDING;
  FETCH_TIMEOUT;
  JITTER_PERCENTAGE;
  generateKey(params) {
    const stableString = Object.keys(params).filter((k) => params[k] !== void 0 && params[k] !== null && params[k] !== "").sort().map((k) => `${k}:${String(params[k])}`).join("|");
    const hash3 = import_crypto2.default.createHash("sha256").update(stableString).digest("hex");
    return `${this.options.prefix}${hash3}`;
  }
  async getOrFetch(key, fetcher, parentSignal) {
    if (this.pendingFetches.size >= this.MAX_PENDING) {
      return errOf(new ServiceOverloadError());
    }
    const existing = this.pendingFetches.get(key);
    if (existing) {
      return await existing;
    }
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        const envelope = JSON.parse(cached);
        if (envelope.s) {
          if (!("v" in envelope)) {
            logger.error({ key, envelope }, "Cache corrompida detectada: CacheEnvelope de sucesso sem valor");
            return errOf(
              new ProviderFailureError("Cache", "AddressProvider" /* Address */, new Error("Corrupted Cache: Missing value"))
            );
          }
          return ok(envelope.v);
        }
        if (!envelope.s && envelope.e) {
          const deserializer = this.options.deserializeError;
          if (deserializer) {
            const deserialized = deserializer(envelope.e.type, envelope.e.message, envelope.e.data);
            if (deserialized) {
              return errOf(deserialized);
            }
          }
          return errOf(
            new ProviderFailureError(
              "Cache",
              "AddressProvider" /* Address */,
              new Error(`Cached Error: ${envelope.e.type} - ${envelope.e.message}`)
            )
          );
        }
      }
    } catch (err2) {
      logger.warn({ err: err2, key }, "Erro de leitura ou falha do Redis. Continuando sem cache.");
    }
    const existingAfterRedis = this.pendingFetches.get(key);
    if (existingAfterRedis) {
      return await existingAfterRedis;
    }
    const promise = this.executeFetchWithSignalLogic(key, fetcher, parentSignal);
    this.pendingFetches.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pendingFetches.delete(key);
    }
  }
  async executeFetchWithSignalLogic(key, fetcher, parentSignal) {
    const timeoutSignal = AbortSignal.timeout(this.FETCH_TIMEOUT);
    const signals = [timeoutSignal];
    if (parentSignal instanceof AbortSignal) {
      signals.push(parentSignal);
    }
    const effectiveSignal = AbortSignal.any(signals);
    if (effectiveSignal.aborted) {
      return errOf(new TimeoutExceededError(effectiveSignal.reason));
    }
    try {
      const result = await fetcher(effectiveSignal);
      if (effectiveSignal.aborted) {
        return errOf(new TimeoutExceededError(effectiveSignal.reason));
      }
      if (isErr(result)) {
        const err2 = result.error;
        const isRetryableFn = this.options.isRetryable ?? ((error) => error?.failureMode === "RETRYABLE");
        if (!isRetryableFn(err2)) {
          const serializer = this.options.serializeError ?? ((error) => ({
            type: error.constructor?.name || "Error",
            message: error.message || String(error),
            data: error
          }));
          await this.setResult(key, {
            s: false,
            e: serializer(err2)
          });
        }
        return errOf(err2);
      }
      await this.setResult(key, { s: true, v: result.value });
      return ok(result.value);
    } catch (error) {
      if (effectiveSignal.aborted) {
        const abortReason = parentSignal?.aborted ? parentSignal.reason : "Timeout Exceeded";
        return errOf(new TimeoutExceededError(abortReason));
      }
      return errOf(new ProviderFailureError("Fetcher", "AddressProvider" /* Address */, error));
    }
  }
  async setResult(key, envelope) {
    const baseTtl = !envelope.s ? this.options.negativeTtlSeconds : this.options.defaultTtlSeconds;
    if (baseTtl <= 0) {
      logger.debug({ key }, "TTL <= 0, pulando escrita no cache");
      return;
    }
    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE);
      const randomOffset = Math.floor(Math.random() * (jitterAmount * 2 + 1)) - jitterAmount;
      const finalTtl = Math.max(1, baseTtl + randomOffset);
      await this.redis.set(key, JSON.stringify(envelope), "EX", finalTtl);
    } catch (err2) {
      logger.warn({ err: err2, key }, "Falha ao escrever no Redis (n\xE3o fatal, continuando)");
    }
  }
};

// src/use-cases/churches/cep-to-lat-lon-use-case.ts
var CepToLatLonUseCase = class {
  constructor(geocodingProvider, addressProvider, redis, optionsOverride, cacheSuccessResults = true) {
    this.geocodingProvider = geocodingProvider;
    this.addressProvider = addressProvider;
    this.redis = redis;
    this.cacheSuccessResults = cacheSuccessResults;
    this.cacheManager = new ResilientCache(redis, {
      prefix: optionsOverride.prefix,
      defaultTtlSeconds: optionsOverride.defaultTtlSeconds,
      negativeTtlSeconds: optionsOverride.negativeTtlSeconds,
      maxPendingFetches: optionsOverride.maxPendingFetches,
      fetchTimeoutMs: optionsOverride.fetchTimeoutMs,
      ttlJitterPercentage: optionsOverride.ttlJitterPercentage,
      serializeError: optionsOverride.serializeError,
      deserializeError: optionsOverride.deserializeError,
      isRetryable: optionsOverride.isRetryable
    });
  }
  cacheManager;
  redis;
  cacheSuccessResults;
  async execute({ cep }) {
    const cleanCep = cep.replace(/\D/g, "");
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep });
    const result = await this.cacheManager.getOrFetch(cacheKey, async (signal) => {
      return await this.processCep(cleanCep, signal);
    });
    if (isOk(result) && !this.cacheSuccessResults) {
      await this.redis.del(cacheKey);
    }
    return result;
  }
  async processCep(cleanCep, signal) {
    const addrResult = await this.addressProvider.fetchAddress(cleanCep, signal);
    if (isErr(addrResult)) {
      return errOf(addrResult.error);
    }
    const data = addrResult.value;
    if (!data) {
      return errOf(new InvalidCepError());
    }
    if (data.lat && data.lon) {
      return ok({
        userLat: data.lat,
        userLon: data.lon,
        precision: data.precision ?? "NO_CERTAINTY" /* NO_CERTAINTY */,
        coordinatesProviderName: data.providerName ?? "Unknown"
      });
    }
    const address = data;
    const { logradouro, localidade, uf, bairro } = address;
    if (logradouro) {
      const exactResult = await this.geocodingProvider.search(`${logradouro}, ${localidade} - ${uf}, Brazil`, signal);
      if (isOk(exactResult) && exactResult.value) {
        return ok(this.mapResponse(exactResult.value));
      }
      if (isErr(exactResult) && exactResult.error.failureMode !== "NOT_FOUND" /* NOT_FOUND */) {
        return errOf(exactResult.error);
      }
    }
    if (bairro) {
      const approxResult = await this.geocodingProvider.search(`${bairro}, ${localidade} - ${uf}, Brazil`, signal);
      if (isOk(approxResult) && approxResult.value) {
        return ok(this.mapResponse(approxResult.value));
      }
      if (isErr(approxResult) && approxResult.error.failureMode !== "NOT_FOUND" /* NOT_FOUND */) {
        return errOf(approxResult.error);
      }
    }
    if (localidade) {
      const cityResult = await this.geocodingProvider.searchStructured(
        {
          city: localidade,
          state: uf,
          country: "Brazil"
        },
        signal
      );
      if (isOk(cityResult)) {
        if (cityResult.value === null) {
          return errOf(new CoordinatesNotFoundError());
        }
        return ok(this.mapResponse(cityResult.value));
      } else {
        return errOf(cityResult.error);
      }
    }
    logger.error({ cep: cleanCep, city: localidade }, "Cr\xEDtico: Geocoding Provider n\xE3o encontrou a cidade.");
    return errOf(new CepToLatLonError(cleanCep));
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
    super(EMPTY_CHURCH_LIST_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/errors/no-nearby-churches-found-error.ts
var NoNearbyChurchesFoundError = class extends DomainError {
  constructor() {
    super(NO_NEARBY_CHURCHES_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/churches/calculate-church-route-distances-use-case.ts
var CalculateChurchRouteDistancesUseCase = class {
  constructor(routingProvider) {
    this.routingProvider = routingProvider;
  }
  async findNearest({ churches, user, signal }, profile) {
    if (!churches.length) {
      return errOf(new EmptyChurchListError());
    }
    const routeResult = await this.routingProvider.getDistances({
      origin: {
        lat: user.userLat,
        lon: user.userLon
      },
      destinations: churches.map((church) => ({
        lat: church.lat,
        lon: church.lon
      })),
      profile,
      signal
    });
    if (isErr(routeResult)) {
      return routeResult;
    }
    const results = routeResult.value;
    const rankedChurches = results.map((result, index) => {
      if (!result || result.distance == null || result.status != null && result.status !== 0) return null;
      return {
        ...churches[index],
        distanceKm: result.distance,
        distanceMeters: result.distance * 1e3
      };
    }).filter((church) => church !== null).sort((firstChurch, secondChurch) => firstChurch.distanceKm - secondChurch.distanceKm);
    if (!rankedChurches.length) {
      return errOf(new NoNearbyChurchesFoundError());
    }
    return ok(rankedChurches);
  }
};

// src/http/presenters/church-presenter.ts
var ChurchPresenter = class {
  static toHTTP(input) {
    if (Array.isArray(input)) {
      return input.map((c) => {
        if ("distanceKm" in c && "distanceMeters" in c) {
          return this.toHTTP(c);
        }
        return this.toHTTP(c);
      });
    }
    if ("distanceKm" in input && "distanceMeters" in input) {
      return {
        publicId: input.publicId,
        name: input.name,
        address: input.address,
        lat: input.lat,
        lon: input.lon,
        distanceKm: input.distanceKm,
        distanceMeters: input.distanceMeters
      };
    }
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
};

// src/use-cases/churches/find-nearest-churches-use-case.ts
var FindNearestChurchesUseCase = class {
  constructor(cepToLatLonUseCase, findNearbyChurchesKnnUseCase, calculateChurchRouteDistancesUseCase, redis, optionsOverride, defaultProfile = "pedestrian" /* PEDESTRIAN */) {
    this.cepToLatLonUseCase = cepToLatLonUseCase;
    this.findNearbyChurchesKnnUseCase = findNearbyChurchesKnnUseCase;
    this.calculateChurchRouteDistancesUseCase = calculateChurchRouteDistancesUseCase;
    this.cacheManager = new ResilientCache(redis, {
      prefix: optionsOverride.prefix,
      defaultTtlSeconds: optionsOverride.defaultTtlSeconds,
      negativeTtlSeconds: optionsOverride.negativeTtlSeconds,
      maxPendingFetches: optionsOverride.maxPendingFetches,
      fetchTimeoutMs: optionsOverride.fetchTimeoutMs,
      ttlJitterPercentage: optionsOverride.ttlJitterPercentage,
      serializeError: optionsOverride.serializeError,
      deserializeError: optionsOverride.deserializeError,
      isRetryable: optionsOverride.isRetryable
    });
    this.defaultProfile = defaultProfile;
  }
  cacheManager;
  defaultProfile;
  async execute({ cep }) {
    const cleanCep = cep.replace(/\D/g, "");
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep, profile: this.defaultProfile });
    return await this.cacheManager.getOrFetch(cacheKey, async (signal) => {
      const cepResult = await this.cepToLatLonUseCase.execute({
        cep: cleanCep
      });
      if (isErr(cepResult)) {
        return errOf(cepResult.error);
      }
      const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value;
      const knnResult = await this.findNearbyChurchesKnnUseCase.execute({
        userLat,
        userLon
      });
      if (isErr(knnResult)) {
        return errOf(knnResult.error);
      }
      const { churches, totalFound } = knnResult.value;
      const nearestChurchesResult = await this.calculateChurchRouteDistancesUseCase.findNearest(
        {
          churches,
          user: { userLat, userLon },
          signal
        },
        this.defaultProfile
      );
      if (isErr(nearestChurchesResult)) {
        return errOf(nearestChurchesResult.error);
      }
      const nearestChurches = nearestChurchesResult.value;
      return ok({
        nearestChurchesInfo: ChurchPresenter.toHTTP(nearestChurches),
        totalFound,
        precision,
        coordinatesProviderName
      });
    });
  }
};

// src/use-cases/errors/latitude-range-error.ts
var LatitudeRangeError = class extends DomainError {
  constructor() {
    super(LATITUDE_OUT_OF_RANGE_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/errors/longitude-range-error.ts
var LongitudeRangeError = class extends DomainError {
  constructor() {
    super(LONGITUDE_OUT_OF_RANGE_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/churches/find-nearby-churches-knn-use-case.ts
var FindNearbyChurchesKnnUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  async execute({
    userLat,
    userLon
  }) {
    if (userLat < -90 || userLat > 90) {
      return errOf(new LatitudeRangeError());
    }
    if (userLon < -180 || userLon > 180) {
      return errOf(new LongitudeRangeError());
    }
    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: 5
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
    super(CHURCH_NOT_FOUND_ERROR, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/create-church-error.ts
var CreateChurchError = class extends DomainError {
  constructor() {
    super(CREATE_CHURCH_FAILED_ERROR, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/repositories/prisma/prisma-churches-repository.ts
var PrismaChurchesRepository = class {
  constructor(errorMapper) {
    this.errorMapper = errorMapper;
  }
  async findNearest({ userLat, userLon, limit = 20 }) {
    try {
      const knnCandidates = Math.max(100, limit * 5);
      const churches = await prisma.$queryRawUnsafe(
        `
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
      `,
        userLat,
        userLon,
        limit,
        knnCandidates
      );
      const mappedChurches = churches.map((church) => ({
        ...church,
        distanceMeters: parseFloat(Number(church.distanceMeters).toFixed(15)),
        distanceKm: parseFloat((church.distanceMeters / 1e3).toFixed(15))
      }));
      return ok(mappedChurches);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
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
      return errOf(this.errorMapper.mapToKnownError(error));
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
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
  async createChurch(data) {
    try {
      const rows = await prisma.$queryRaw`
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
      const church = rows[0];
      if (!church) {
        return errOf(new CreateChurchError());
      }
      return ok(church);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
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
      const church = rows[0];
      if (!church) {
        return errOf(new ChurchNotFoundError());
      }
      return ok(church);
    } catch (error) {
      return errOf(this.errorMapper.mapToKnownError(error));
    }
  }
};

// src/use-cases/errors/church-already-exists-error.ts
var ChurchAlreadyExistsError = class extends DomainError {
  constructor() {
    super(CHURCH_ALREADY_EXISTS_ERROR, "CONFLICT" /* CONFLICT */);
  }
};

// src/repositories/prisma/errors/churches-error-mapping.ts
var churchPrismaErrorMapping = {
  P2002: () => new ChurchAlreadyExistsError(),
  // Unique constraint violation (create)
  P2025: () => new ChurchNotFoundError()
  // Record not found (delete/update)
};

// src/providers/address-provider/error/no-address-provider-error.ts
var NoAddressProviderError = class extends Error {
  constructor() {
    super(NO_ADDRESS_PROVIDER_ERROR_MESSAGE);
  }
};

// src/providers/address-provider/resilient-address-provider.ts
var ResilientAddressProvider = class {
  constructor(providers) {
    this.providers = providers;
    if (this.providers.length === 0) {
      throw new NoAddressProviderError();
    }
  }
  async fetchAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const effectiveSignal = signal ?? new AbortController().signal;
    let lastRetryableError = void 0;
    let lastProviderName = "";
    let notFoundCount = 0;
    for (const [index, provider] of this.providers.entries()) {
      const providerName = provider.providerName ?? provider.constructor.name;
      if (effectiveSignal.aborted) {
        return errOf(new TimeoutExceededError(effectiveSignal.reason));
      }
      const result = await provider.fetchAddress(cleanCep, effectiveSignal);
      if (isOk(result)) {
        if (result.value) {
          logger.info({ provider: providerName }, "Endere\xE7o obtido com sucesso por um provedor de endere\xE7o");
          return ok(result.value);
        }
        notFoundCount++;
        logger.info({ provider: providerName }, "Provedor retornou null (n\xE3o encontrado) - tentando pr\xF3ximo");
        continue;
      }
      const error = result.error;
      if (error.failureMode === "NOT_FOUND" /* NOT_FOUND */) {
        notFoundCount++;
        logger.info(
          { provider: providerName, cep: cleanCep },
          "Provedor confirmou que o recurso n\xE3o existe - tentando pr\xF3ximo"
        );
        continue;
      }
      if (error.failureMode === "RETRYABLE" /* RETRYABLE */) {
        lastRetryableError = error;
        lastProviderName = providerName;
        logger.warn(
          { provider: providerName, error: error.message, attempt: index + 1 },
          "Provedor de endere\xE7o retornou erro recuper\xE1vel. Alternando para o pr\xF3ximo provedor..."
        );
        continue;
      }
      logger.error({ provider: providerName, error: error.message }, "Provedor retornou erro fatal. Abortando cadeia.");
      return errOf(error);
    }
    if (notFoundCount === this.providers.length) {
      logger.warn(
        { cep: cleanCep, notFoundCount, totalProviders: this.providers.length },
        "TODOS os provedores confirmaram CEP inv\xE1lido/n\xE3o encontrado"
      );
      return errOf(new InvalidCepError());
    }
    if (lastRetryableError) {
      logger.error(
        { cep: cleanCep, provider: lastProviderName, notFoundCount },
        "Provedores de endere\xE7o falharam com erros de sistema"
      );
      return errOf(lastRetryableError);
    }
    return errOf(
      new ProviderFailureError(
        "ResilientAddressProvider",
        "AddressProvider" /* Address */,
        new Error("TODOS os provedores falharam")
      )
    );
  }
};

// src/lib/http/axios.ts
var import_axios = __toESM(require("axios"));

// src/lib/http/https-agent.ts
var import_https = __toESM(require("https"));
var agents = /* @__PURE__ */ new Map();
var DEFAULT_CONFIG = {
  keepAlive: true,
  keepAliveMsecs: 1e3,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: 6e4,
  scheduling: "lifo"
};
var getHttpsAgent = (options = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...options };
  const key = JSON.stringify(finalConfig, Object.keys(finalConfig).sort());
  if (!agents.has(key)) {
    agents.set(key, new import_https.default.Agent(finalConfig));
  }
  let agent = agents.get(key);
  if (!agent) {
    agent = new import_https.default.Agent(finalConfig);
    agents.set(key, agent);
  }
  return agent;
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

// src/lib/infra/rate-limiter/redis-rate-limiter.ts
var import_rate_limiter_flexible = require("rate-limiter-flexible");

// src/lib/errors/infra/rate-limiter/noRateLimiterSetError.ts
var NoRateLimiterSetError = class extends Error {
  constructor(reason) {
    super(`Rate limiter n\xE3o configurado. Reason: ${reason ?? "Unknown"}`);
  }
};

// src/core/constants/redis/redis-keys.ts
var REDIS_KEYS = {
  IDEMPOTENCY_EMAIL_PREFIX: "idempotency:email:",
  RATE_LIMIT_PREFIX: "ratelimit:v1:"
};

// src/lib/infra/rate-limiter/redis-rate-limiter.ts
var RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS = Number(process.env.REDIS_LOG_OUTAGE_INTERVAL_MS ?? 3e4);
var RedisRateLimiter = class _RedisRateLimiter {
  static instance;
  static infraOutageStartedAt = null;
  static infraLastWarnAt = 0;
  static infraSuppressedLogs = 0;
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
    ["locationIqAddressProvider" /* LOCATION_IQ_ADDRESS */]: {
      points: 2,
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
    if (!this.instance) {
      this.instance = new _RedisRateLimiter(redis);
    }
    return this.instance;
  }
  /**
   * Retorna ou cria um RateLimiter para o provider.
   * ❗ Provider PRECISA existir em providerConfigs.
   */
  getLimiter(provider) {
    const config = this.providerConfigs[provider];
    if (!config) {
      throw new NoRateLimiterSetError(provider);
    }
    const existingLimiter = this.limiters.get(provider);
    if (existingLimiter) {
      return existingLimiter;
    }
    const limiter = new import_rate_limiter_flexible.RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: `${REDIS_KEYS.RATE_LIMIT_PREFIX}${provider}`,
      points: config.points,
      duration: config.windowSeconds,
      execEvenly: false,
      blockDuration: 0
    });
    this.limiters.set(provider, limiter);
    if (this.limiters.size > 50) {
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
      _RedisRateLimiter.logInfraRecoveryIfNeeded(provider);
      return true;
    } catch (error) {
      const err2 = error;
      if (typeof err2 === "object" && err2 !== null && "remainingPoints" in err2 && typeof err2.remainingPoints === "number") {
        return false;
      }
      const obj = typeof err2 === "object" && err2 !== null ? err2 : {};
      _RedisRateLimiter.logInfraDegraded(provider, obj);
      return true;
    }
  }
  static logInfraDegraded(provider, obj) {
    const now = Date.now();
    if (this.infraOutageStartedAt === null) {
      this.infraOutageStartedAt = now;
      this.infraLastWarnAt = now;
      this.infraSuppressedLogs = 0;
      logger.warn(
        {
          provider,
          mode: "fail-open",
          redisOutage: true,
          message: typeof obj.message === "string" ? obj.message : void 0,
          code: typeof obj.code === "string" ? obj.code : void 0,
          name: typeof obj.name === "string" ? obj.name : void 0
        },
        "RedisRateLimiter com erro: Redis n\xE3o dispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open)."
      );
      return;
    }
    if (now - this.infraLastWarnAt >= RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS) {
      logger.warn(
        {
          provider,
          mode: "fail-open",
          redisOutage: true,
          outageDurationMs: now - this.infraOutageStartedAt,
          suppressedLogs: this.infraSuppressedLogs,
          message: typeof obj.message === "string" ? obj.message : void 0,
          code: typeof obj.code === "string" ? obj.code : void 0,
          name: typeof obj.name === "string" ? obj.name : void 0
        },
        "RedisRateLimiter still degraded: Redis n\xE3o dispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open)."
      );
      this.infraLastWarnAt = now;
      this.infraSuppressedLogs = 0;
      return;
    }
    this.infraSuppressedLogs += 1;
  }
  static logInfraRecoveryIfNeeded(provider) {
    if (this.infraOutageStartedAt === null) {
      return;
    }
    const now = Date.now();
    logger.info(
      {
        provider,
        outageDurationMs: now - this.infraOutageStartedAt,
        suppressedLogs: this.infraSuppressedLogs
      },
      "RedisRateLimiter recovered: Redis available again."
    );
    this.infraOutageStartedAt = null;
    this.infraLastWarnAt = 0;
    this.infraSuppressedLogs = 0;
  }
  static async destroyInstance() {
    if (!this.instance) {
      logger.debug("Nenhuma inst\xE2ncia de RedisRateLimiter para destruir.");
      return;
    }
    await this.instance.destroyRateLimiterMap();
    this.instance = null;
  }
  async destroyRateLimiterMap() {
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
    const type = data.type || "";
    const category = data.class || "";
    if (rank >= 26) return "ROOFTOP" /* ROOFTOP */;
    if (["house", "building", "residential", "apartments", "commercial"].includes(type) || ["highway", "secondary", "primary", "road"].includes(category)) {
      return "ROOFTOP" /* ROOFTOP */;
    }
    if (rank >= 16) return "NEIGHBORHOOD" /* NEIGHBORHOOD */;
    if (["neighbourhood", "suburb", "quarter", "hamlet", "district"].includes(type) || data.addresstype === "suburb") {
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

// src/providers/address-provider/awesome-api-provider.ts
var AwesomeApiProvider = class _AwesomeApiProvider {
  constructor(config) {
    this.config = config;
    if (!_AwesomeApiProvider.api) {
      _AwesomeApiProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.TIMEOUT,
        headers: {
          "User-Agent": "EvangelismoDigitalBackend/1.0"
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT
        }
      });
    }
  }
  static api;
  providerName = "AwesomeAPI";
  rateLimitConfig = "awesomeApiAddressProvider" /* AWESOME_API_ADDRESS */;
  maxRetries = 2;
  backoffMs = 100;
  TIMEOUT = 1500;
  // HTTPS Agent Settings
  KEEP_ALIVE_MSECS = 1e3;
  MAX_SOCKETS = 100;
  MAX_FREE_SOCKETS = 10;
  HTTPS_AGENT_TIMEOUT = 6e4;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await _AwesomeApiProvider.api.get(`/${cleanCep}`, {
      signal
    });
    if (!data || !data.cep) {
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
      lat: parseFloat(data.lat),
      lon: parseFloat(data.lng),
      precision,
      providerName: "AwesomeAPI"
    };
  }
};

// src/providers/address-provider/brasil-api-provider.ts
var BrasilApiProvider = class _BrasilApiProvider {
  constructor(config) {
    this.config = config;
    if (!_BrasilApiProvider.api) {
      _BrasilApiProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.TIMEOUT,
        headers: {
          "User-Agent": "EvangelismoDigitalBackend/1.0"
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT
        }
      });
    }
  }
  static api;
  providerName = "BrasilAPI";
  rateLimitConfig = "brasilApiAddressProvider" /* BRASIL_API_ADDRESS */;
  maxRetries = 2;
  backoffMs = 100;
  TIMEOUT = 1500;
  // HTTPS Agent Settings
  KEEP_ALIVE_MSECS = 1e3;
  MAX_SOCKETS = 100;
  MAX_FREE_SOCKETS = 10;
  HTTPS_AGENT_TIMEOUT = 6e4;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await _BrasilApiProvider.api.get(`/${cleanCep}`, {
      signal
    });
    if (!data || !data.cep || !data.city || !data.state) {
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

// src/providers/address-provider/viaCep-provider.ts
var ViaCepProvider = class _ViaCepProvider {
  constructor(config) {
    this.config = config;
    if (!_ViaCepProvider.api) {
      _ViaCepProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.VIACEP_TIMEOUT,
        headers: {
          "User-Agent": "EvangelismoDigitalBackend/1.0"
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT
        }
      });
    }
  }
  static api;
  providerName = "ViaCEP";
  rateLimitConfig = "viacepAddressProvider" /* VIACEP_ADDRESS */;
  maxRetries = 2;
  backoffMs = 200;
  VIACEP_TIMEOUT = 3e3;
  // HTTPS Agent Settings
  KEEP_ALIVE_MSECS = 1e3;
  MAX_SOCKETS = 100;
  MAX_FREE_SOCKETS = 10;
  HTTPS_AGENT_TIMEOUT = 6e4;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await _ViaCepProvider.api.get(`/${cleanCep}/json`, {
      signal
    });
    if (!data || data.erro) {
      throw new InvalidCepError(cleanCep);
    }
    const precision = PrecisionHelper.fromAddressData(data);
    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      localidade: data.localidade,
      uf: data.uf,
      precision,
      providerName: "ViaCEP"
    };
  }
};

// src/providers/geo-provider/nominatim-provider.ts
var NominatimGeoProvider = class _NominatimGeoProvider {
  constructor(config) {
    this.config = config;
    if (!_NominatimGeoProvider.api) {
      _NominatimGeoProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.NOMINATIM_TIMEOUT,
        headers: {
          "User-Agent": "EvangelismoDigitalBackend/1.0 (contact@findhope.digital)"
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT
        }
      });
    }
  }
  static api;
  providerName = "Nominatim";
  rateLimitConfig = "nominatimGeocodingProvider" /* NOMINATIM_GEOCODING */;
  maxRetries = 2;
  backoffMs = 200;
  NOMINATIM_TIMEOUT = 4e3;
  // HTTPS Agent Settings
  KEEP_ALIVE_MSECS = 1e3;
  MAX_SOCKETS = 100;
  MAX_FREE_SOCKETS = 10;
  HTTPS_AGENT_TIMEOUT = 6e4;
  async searchRaw(query, signal) {
    return this.performRequest({ q: query, limit: 1, format: "json" }, signal);
  }
  async searchStructuredRaw(options, signal) {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: 1,
        format: "json"
      },
      signal
    );
  }
  async performRequest(params, signal) {
    const cleanParams = this.cleanParams(params);
    const response = await _NominatimGeoProvider.api.get("/search", {
      params: cleanParams,
      signal
    });
    if (!response.data || response.data.length === 0) {
      return null;
    }
    const bestMatch = response.data[0];
    return {
      lat: parseFloat(bestMatch.lat),
      lon: parseFloat(bestMatch.lon),
      precision: PrecisionHelper.fromOsm(bestMatch),
      providerName: "Nominatim"
    };
  }
  cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0 && value !== null && value !== "") {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
};

// src/providers/geo-provider/location-iq-provider.ts
var LocationIqProvider = class _LocationIqProvider {
  constructor(config) {
    this.config = config;
    if (!_LocationIqProvider.api) {
      _LocationIqProvider.api = createHttpClient({
        baseURL: this.config.apiUrl,
        timeout: this.TIMEOUT,
        params: {
          key: this.config.apiToken,
          format: "json"
        },
        agentOptions: {
          keepAliveMsecs: this.KEEP_ALIVE_MSECS,
          maxSockets: this.MAX_SOCKETS,
          maxFreeSockets: this.MAX_FREE_SOCKETS,
          timeout: this.HTTPS_AGENT_TIMEOUT
        }
      });
    }
  }
  static api;
  providerName = "LocationIQ";
  rateLimitConfig = "locationIqGeocodingProvider" /* LOCATION_IQ_GEOCODING */;
  maxRetries = 2;
  backoffMs = 200;
  TIMEOUT = 2e3;
  // HTTPS Agent Settings
  KEEP_ALIVE_MSECS = 1e3;
  MAX_SOCKETS = 100;
  MAX_FREE_SOCKETS = 10;
  HTTPS_AGENT_TIMEOUT = 6e4;
  async searchRaw(query, signal) {
    return this.performRequest({ q: query, limit: 1, addressdetails: 1 }, signal);
  }
  async searchStructuredRaw(options, signal) {
    return this.performRequest(
      {
        street: options.street,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: 1,
        addressdetails: 1
      },
      signal
    );
  }
  async performRequest(params, signal) {
    const response = await _LocationIqProvider.api.get("/search", {
      params,
      signal
    });
    if (!response.data || response.data.length === 0) {
      return null;
    }
    const bestMatch = response.data[0];
    return {
      lat: parseFloat(bestMatch.lat),
      lon: parseFloat(bestMatch.lon),
      precision: PrecisionHelper.fromOsm(bestMatch),
      providerName: "LocationIQ"
    };
  }
};

// src/providers/geo-provider/error/no-geo-provider-error.ts
var NoGeoProviderError = class extends Error {
  constructor() {
    super(NO_GEO_PROVIDER_ERROR_MESSAGE);
  }
};

// src/providers/geo-provider/resilient-geo-provider.ts
var ResilientGeoProvider = class {
  constructor(providers) {
    this.providers = providers;
    if (this.providers.length === 0) {
      throw new NoGeoProviderError();
    }
  }
  async search(query, signal) {
    const effectiveSignal = signal ?? new AbortController().signal;
    return await this.executeStrategy((provider, innerSignal) => provider.search(query, innerSignal), effectiveSignal);
  }
  async searchStructured(options, signal) {
    const effectiveSignal = signal ?? new AbortController().signal;
    return await this.executeStrategy(
      (provider, innerSignal) => provider.searchStructured(options, innerSignal),
      effectiveSignal
    );
  }
  async executeStrategy(action, signal) {
    let lastRetryableError = void 0;
    let lastProviderName = "";
    let notFoundCount = 0;
    for (const [index, provider] of this.providers.entries()) {
      const providerName = provider.providerName ?? provider.constructor.name;
      if (signal.aborted) {
        return errOf(new TimeoutExceededError(signal.reason));
      }
      const result = await action(provider, signal);
      if (isOk(result)) {
        if (result.value !== null) {
          logger.info({ provider: providerName }, "Geocodifica\xE7\xE3o obtida com sucesso por um provedor de geocodifica\xE7\xE3o");
          return ok(result.value);
        }
        notFoundCount++;
        logger.info({ provider: providerName }, "Provedor retornou null (n\xE3o encontrado) - tentando pr\xF3ximo");
        continue;
      }
      const error = result.error;
      if (error.failureMode === "NOT_FOUND" /* NOT_FOUND */) {
        notFoundCount++;
        logger.info({ provider: providerName }, "Coordenadas n\xE3o encontradas - tentando pr\xF3ximo");
        continue;
      }
      if (error.failureMode === "RETRYABLE" /* RETRYABLE */) {
        lastRetryableError = error;
        lastProviderName = providerName;
        logger.warn(
          { provider: providerName, attempt: index + 1, error: error.message },
          "Provedor de geocodifica\xE7\xE3o retornou erro recuper\xE1vel. Alternando para o pr\xF3ximo provedor..."
        );
        continue;
      }
      logger.error({ provider: providerName, error: error.message }, "Provedor retornou erro fatal. Abortando cadeia.");
      return errOf(error);
    }
    if (notFoundCount === this.providers.length) {
      logger.warn(
        { notFoundCount, totalProviders: this.providers.length },
        "Nenhum provedor retornou resultados - coordenadas n\xE3o encontradas"
      );
      return errOf(new CoordinatesNotFoundError());
    }
    if (lastRetryableError) {
      logger.error({ provider: lastProviderName }, "Geocodifica\xE7\xE3o falhou com erros de sistema");
      return errOf(lastRetryableError);
    }
    return errOf(
      new ProviderFailureError("ResilientGeoProvider", "GeoProvider" /* Geo */, new Error("TODOS os provedores falharam"))
    );
  }
};

// src/providers/church-routing-provider/stadia-church-routing-provider.ts
var StadiaChurchRoutingProvider = class _StadiaChurchRoutingProvider {
  constructor(config) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 2500;
    this.defaultCosting = config.defaultCosting;
    if (!_StadiaChurchRoutingProvider.api) {
      _StadiaChurchRoutingProvider.api = createHttpClient({
        timeout: this.timeoutMs
      });
    }
  }
  static api;
  providerName = "Stadia Maps";
  rateLimitConfig = "stadiaRoutingProvider" /* STADIA_ROUTING */;
  timeoutMs;
  defaultCosting;
  async fetchRawDistance(origin, destination, profile, signal) {
    const costing = profile ?? this.config.defaultCosting ?? "auto" /* AUTO */;
    const response = await _StadiaChurchRoutingProvider.api.post(
      this.config.apiUrl.replace(/\/$/, ""),
      {
        locations: [
          { lat: origin.lat, lon: origin.lon },
          { lat: destination.lat, lon: destination.lon }
        ],
        costing,
        directions_options: {
          units: "kilometers"
        }
      },
      {
        headers: {
          Authorization: `Stadia-Auth ${this.config.apiToken}`,
          "Content-Type": "application/json"
        },
        signal,
        validateStatus: (status2) => status2 >= 200 && status2 < 300 || status2 === 404
      }
    );
    if (response.status === 404) {
      return {
        distance: null,
        status: 404
      };
    }
    const distance = this.extractDistanceKm(response.data);
    const status = response.data?.status;
    if (distance == null || typeof status === "number" && status !== 0) {
      return {
        distance: null,
        status: typeof status === "number" ? status : 0
      };
    }
    return {
      distance,
      status: typeof status === "number" ? status : 0
    };
  }
  extractDistanceKm(responseData) {
    if (typeof responseData?.distance === "number") {
      return responseData.distance;
    }
    const routeLength = responseData?.routes?.[0]?.summary?.length;
    if (typeof routeLength === "number") {
      return routeLength;
    }
    const tripLength = responseData?.trip?.summary?.length;
    if (typeof tripLength === "number") {
      return tripLength;
    }
    return null;
  }
};

// src/errors/mappings/find-nearest-churches-error-mapper.ts
var import_axios8 = require("axios");
var import_client6 = require("@prisma/client");

// src/errors/infrastructure/service-busy-error.ts
var ServiceBusyError = class extends InfrastructureError {
  constructor(provider) {
    super(
      {
        code: SERVICE_BUSY_ERROR.code,
        message: `${SERVICE_BUSY_ERROR.message} [Provedor: ${provider}]`
      },
      void 0,
      "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */,
      "RETRYABLE" /* RETRYABLE */
    );
    this.name = "ServiceBusyError";
  }
};

// src/errors/mappings/find-nearest-churches-error-mapper.ts
var FindNearestChurchesErrorMapper = class _FindNearestChurchesErrorMapper {
  static async runCatching(fn) {
    try {
      return await fn();
    } catch (error) {
      return errOf(_FindNearestChurchesErrorMapper.map(error));
    }
  }
  static map(error) {
    if (error instanceof AppError) {
      return error;
    }
    if (_FindNearestChurchesErrorMapper.isAxiosError(error)) {
      const axiosError = error;
      const status = axiosError.response?.status;
      const code = axiosError.code;
      if (status === 429) {
        return new ServiceBusyError(_FindNearestChurchesErrorMapper.detectProvider(axiosError));
      }
      if (code === "ERR_CANCELED" || code === "ECONNABORTED" || axiosError.message.toLowerCase().includes("timeout")) {
        return new TimeoutExceededError(axiosError.message);
      }
      if (status === 404) {
        const url = axiosError.config?.url || "";
        if (url.includes("viacep") || url.includes("awesomeapi") || url.includes("brasilapi")) {
          const cep = _FindNearestChurchesErrorMapper.extractCep(url);
          return new InvalidCepError(cep);
        }
        return new CoordinatesNotFoundError();
      }
      return new ProviderFailureError(
        _FindNearestChurchesErrorMapper.detectProvider(axiosError),
        _FindNearestChurchesErrorMapper.detectLayer(axiosError),
        error
      );
    }
    if (error instanceof import_client6.Prisma.PrismaClientKnownRequestError || error instanceof import_client6.Prisma.PrismaClientUnknownRequestError) {
      return new DatabaseQueryError(error);
    }
    return new ProviderFailureError(
      "System",
      "AddressProvider" /* Address */,
      error instanceof Error ? error : new Error(String(error))
    );
  }
  static isAxiosError(error) {
    return (0, import_axios8.isAxiosError)(error);
  }
  static detectProvider(error) {
    const url = error.config?.url || "";
    if (url.includes("viacep")) return "ViaCEP";
    if (url.includes("awesomeapi")) return "AwesomeAPI";
    if (url.includes("brasilapi")) return "BrasilAPI";
    if (url.includes("nominatim")) return "Nominatim";
    if (url.includes("locationiq")) return "LocationIQ";
    if (url.includes("stadia")) return "Stadia Maps";
    return "Unknown Provider";
  }
  static detectLayer(error) {
    const url = error.config?.url || "";
    if (url.includes("viacep") || url.includes("awesomeapi") || url.includes("brasilapi")) {
      return "AddressProvider" /* Address */;
    }
    if (url.includes("nominatim") || url.includes("locationiq")) {
      return "GeoProvider" /* Geo */;
    }
    return "ChurchRouteProvider" /* Route */;
  }
  static extractCep(url) {
    const match = url.match(/\b\d{8}\b/) || url.match(/\d{8}/);
    return match ? match[0] : void 0;
  }
};

// src/providers/address-provider/decorators/resilient-address-provider.decorator.ts
var ResilientAddressProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
  }
  providerName;
  async fetchAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection);
    const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig);
    if (!allowed) {
      return errOf(new ServiceBusyError(this.rawProvider.providerName));
    }
    for (let attempt = 1; attempt <= this.rawProvider.maxRetries; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason));
      }
      try {
        const data = await this.rawProvider.fetchRawAddress(cleanCep, signal);
        return ok(data);
      } catch (error) {
        const appError = FindNearestChurchesErrorMapper.map(error);
        const isRetryable = appError.failureMode === "RETRYABLE" /* RETRYABLE */;
        if (!isRetryable || attempt === this.rawProvider.maxRetries) {
          logger.error(
            {
              cep: cleanCep,
              attempt,
              error: appError.message
            },
            `Falha ao buscar endere\xE7o ${this.rawProvider.providerName} ap\xF3s tentativas`
          );
          return errOf(appError);
        }
        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({ cep: cleanCep, attempt, delay }, `Repetindo solicita\xE7\xE3o para ${this.rawProvider.providerName}`);
        await this.sleep(delay);
      }
    }
    logger.error({ cep: cleanCep }, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`);
    return errOf(new ServiceBusyError(this.rawProvider.providerName));
  }
  sleep(ms2) {
    return new Promise((resolve) => setTimeout(resolve, ms2));
  }
};

// src/providers/geo-provider/decorators/resilient-geocoding-provider.decorator.ts
var ResilientGeocodingProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
  }
  providerName;
  async search(query, signal) {
    return this.executeResiliently((sig) => this.rawProvider.searchRaw(query, sig), { query }, signal);
  }
  async searchStructured(options, signal) {
    return this.executeResiliently((sig) => this.rawProvider.searchStructuredRaw(options, sig), { options }, signal);
  }
  async executeResiliently(action, logContext, signal) {
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection);
    const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig);
    if (!allowed) {
      return errOf(new ServiceBusyError(this.rawProvider.providerName));
    }
    for (let attempt = 1; attempt <= this.rawProvider.maxRetries; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason));
      }
      try {
        const data = await action(signal);
        return ok(data);
      } catch (error) {
        const appError = FindNearestChurchesErrorMapper.map(error);
        const isRetryable = appError.failureMode === "RETRYABLE" /* RETRYABLE */;
        if (!isRetryable || attempt === this.rawProvider.maxRetries) {
          logger.error(
            {
              ...logContext,
              attempt,
              error: appError.message
            },
            `Falha ao buscar coordenadas geogr\xE1ficas ${this.rawProvider.providerName} ap\xF3s tentativas`
          );
          return errOf(appError);
        }
        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({ ...logContext, attempt, delay }, `Repetindo solicita\xE7\xE3o para ${this.rawProvider.providerName}`);
        await this.sleep(delay);
      }
    }
    logger.error(logContext, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`);
    return errOf(new ServiceBusyError(this.rawProvider.providerName));
  }
  sleep(ms2) {
    return new Promise((resolve) => setTimeout(resolve, ms2));
  }
};

// src/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator.ts
var ResilientChurchRoutingProviderDecorator = class {
  constructor(rawProvider, redisRateLimiterConnection, redisCacheConnection, cacheOptionsOverride) {
    this.rawProvider = rawProvider;
    this.redisRateLimiterConnection = redisRateLimiterConnection;
    this.providerName = rawProvider.providerName;
    const timeoutMs = rawProvider.timeoutMs;
    this.cacheManager = new ResilientCache(redisCacheConnection, {
      prefix: cacheOptionsOverride?.prefix ?? "cache:stadia-route-distance:",
      defaultTtlSeconds: cacheOptionsOverride?.defaultTtlSeconds ?? 60 * 60,
      negativeTtlSeconds: cacheOptionsOverride?.negativeTtlSeconds ?? 0,
      maxPendingFetches: cacheOptionsOverride?.maxPendingFetches ?? 500,
      fetchTimeoutMs: cacheOptionsOverride?.fetchTimeoutMs ?? timeoutMs,
      ttlJitterPercentage: cacheOptionsOverride?.ttlJitterPercentage ?? 0.05,
      serializeError: cacheOptionsOverride?.serializeError,
      deserializeError: cacheOptionsOverride?.deserializeError,
      isRetryable: cacheOptionsOverride?.isRetryable
    });
  }
  cacheManager;
  providerName;
  async getDistances(params) {
    const results = [];
    for (const destination of params.destinations) {
      const fetchResult = await this.fetchDistance(params.origin, destination, params.profile, params.signal);
      if (!fetchResult.success) {
        return fetchResult;
      }
      results.push(fetchResult.value);
    }
    return ok(results);
  }
  async fetchDistance(origin, destination, profile, parentSignal) {
    const costing = profile ?? this.rawProvider.defaultCosting ?? "auto" /* AUTO */;
    const cacheKey = this.cacheManager.generateKey({
      oLat: origin.lat,
      oLon: origin.lon,
      dLat: destination.lat,
      dLon: destination.lon,
      profile: costing
    });
    const result = await this.cacheManager.getOrFetch(
      cacheKey,
      async (signal) => {
        const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection);
        const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig);
        if (!allowed) {
          return errOf(new ServiceBusyError(this.rawProvider.providerName));
        }
        if (signal.aborted) {
          return errOf(new TimeoutExceededError(signal.reason));
        }
        try {
          const data = await this.rawProvider.fetchRawDistance(origin, destination, costing, signal);
          return ok(data);
        } catch (error) {
          return errOf(FindNearestChurchesErrorMapper.map(error));
        }
      },
      parentSignal
    );
    return result;
  }
};

// src/errors/app-error-registry.ts
var AppErrorRegistry = {
  InvalidCepError: (msg) => {
    const cep = msg.match(/\b\d{8}\b/)?.[0] || msg.match(/\d{8}/)?.[0];
    return new InvalidCepError(cep);
  },
  CoordinatesNotFoundError: () => new CoordinatesNotFoundError(),
  NoNearbyChurchesFoundError: () => new NoNearbyChurchesFoundError(),
  CepToLatLonError: (msg) => {
    const cep = msg.match(/\d+/)?.[0] || "";
    return new CepToLatLonError(cep);
  },
  ServiceBusyError: (msg, data) => {
    const provider = data?.body?.provider || msg.replace("Servi\xE7o temporariamente indispon\xEDvel: ", "");
    return new ServiceBusyError(provider);
  },
  ServiceOverloadError: () => new ServiceOverloadError(),
  TimeoutExceededError: (msg) => new TimeoutExceededError(msg),
  ProviderFailureError: (msg, data) => {
    const provider = data?.body?.providerContext?.provider || data?.providerContext?.provider || "Unknown";
    const layer = data?.body?.providerContext?.layer || data?.providerContext?.layer || "AddressProvider" /* Address */;
    return new ProviderFailureError(provider, layer, data?.originalError);
  }
};
function serializeAppError(err2) {
  return {
    type: err2.constructor.name,
    message: err2.message,
    data: err2.data || err2
  };
}
function deserializeAppError(type, message, data) {
  const factory = AppErrorRegistry[type];
  if (factory) {
    try {
      return factory(message, data);
    } catch {
    }
  }
  return new Error(message);
}

// src/use-cases/factories/make-find-nearest-churches-use-case.ts
var cachedUseCase = null;
function makeFindNearestChurchesUseCase(redisCacheConnection = getRedisCache(), redisRateLimitConnection = getRedisRateLimit()) {
  if (cachedUseCase) {
    return cachedUseCase;
  }
  const rawNominatimProvider = new NominatimGeoProvider({
    apiUrl: env.NOMINATIM_API_URL
  });
  const rawLocationIqProvider = new LocationIqProvider({
    apiUrl: env.LOCATION_IQ_API_URL,
    apiToken: env.LOCATION_IQ_API_TOKEN
  });
  const nominatimProvider = new ResilientGeocodingProviderDecorator(rawNominatimProvider, redisRateLimitConnection);
  const locationIqProvider = new ResilientGeocodingProviderDecorator(rawLocationIqProvider, redisRateLimitConnection);
  const resilientGeoProvider = new ResilientGeoProvider([locationIqProvider, nominatimProvider]);
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
  const resilientAddressProvider = new ResilientAddressProvider([awesomeApiProvider, brasilApiProvider, viaCepProvider]);
  const cepToLatLonUseCase = new CepToLatLonUseCase(
    resilientGeoProvider,
    resilientAddressProvider,
    redisCacheConnection,
    {
      prefix: "cache:cep-coords:",
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 60 * 30,
      maxPendingFetches: 500,
      fetchTimeoutMs: 25e3,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError
    },
    false
  );
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository);
  const rawRoutingProvider = new StadiaChurchRoutingProvider({
    apiUrl: env.STADIA_MAPS_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: "pedestrian" /* PEDESTRIAN */,
    timeoutMs: 2500
  });
  const routingProvider = new ResilientChurchRoutingProviderDecorator(
    rawRoutingProvider,
    redisRateLimitConnection,
    redisCacheConnection,
    {
      prefix: "cache:stadia-route-distance:",
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 0,
      maxPendingFetches: 500,
      fetchTimeoutMs: 2500,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError
    }
  );
  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(routingProvider);
  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    calculateChurchRouteDistancesUseCase,
    redisCacheConnection,
    {
      prefix: "cache:nearest-churches:",
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 60 * 30,
      maxPendingFetches: 500,
      fetchTimeoutMs: 25e3,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError
    },
    "pedestrian" /* PEDESTRIAN */
  );
  return cachedUseCase;
}

// src/http/controllers/churches/find-nearest-churches.controller.ts
async function findNearestChurches(request, reply) {
  const cep = cepSchema.parse(request.query.cep);
  logger.info({
    msg: "Cep do usu\xE1rio recebido para encontrar igrejas pr\xF3ximas",
    ip: request.ip
  });
  const findNearestChurchesUseCase = makeFindNearestChurchesUseCase();
  const result = await findNearestChurchesUseCase.execute({ cep });
  if (isErr(result)) {
    const error = result.error;
    logger.warn({
      msg: "Falha ao buscar igrejas pr\xF3ximas",
      error: error.message,
      cep: request.query.cep
    });
    return HttpErrorMapper.map(error, reply);
  }
  const response = result.value;
  logger.info({
    msg: "Igrejas mais pr\xF3ximas encontradas com sucesso",
    nearestChurchesInfo: response.nearestChurchesInfo
  });
  return reply.status(200).send(response);
}

// src/http/schemas/churches/create-church-schema.ts
var import_zod15 = __toESM(require("zod"));
var createChurchBodySchema = import_zod15.default.object({
  name: import_zod15.default.string().min(3, "O nome deve ter no m\xEDnimo 3 caracteres").transform((val) => val.toLowerCase()),
  address: import_zod15.default.string().min(5, "O endere\xE7o deve ter no m\xEDnimo 5 caracteres").transform((val) => val.toLowerCase()),
  lat: import_zod15.default.coerce.number().min(-90, "Latitude deve ser >= -90").max(90, "Latitude deve ser <= 90"),
  lon: import_zod15.default.coerce.number().min(-180, "Longitude deve ser >= -180").max(180, "Longitude deve ser <= 180")
});

// src/use-cases/errors/no-address-error.ts
var NoAddressError = class extends DomainError {
  constructor() {
    super(NO_ADDRESS_PROVIDED_ERROR, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/churches/create-church-use-case.ts
var CreateChurchUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  async execute({
    name,
    address,
    lat,
    lon
  }) {
    if (!address || address.trim() === "") {
      return errOf(new NoAddressError());
    }
    const nameResult = await this.churchesRepository.findByName(name);
    if (isErr(nameResult)) {
      return nameResult;
    }
    if (nameResult.value !== null) {
      return errOf(new ChurchAlreadyExistsError());
    }
    const paramsResult = await this.churchesRepository.findByParams({
      name,
      lat,
      lon
    });
    if (isErr(paramsResult)) {
      return paramsResult;
    }
    if (paramsResult.value !== null) {
      return errOf(new ChurchAlreadyExistsError());
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
};

// src/use-cases/factories/make-create-church-use-case.ts
function makeCreateChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  const createChurchUseCase = new CreateChurchUseCase(churchesRepository);
  return createChurchUseCase;
}

// src/http/controllers/churches/create-church.controller.ts
async function createChurch(request, reply) {
  const { name, address, lat, lon } = createChurchBodySchema.parse(request.body);
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
    logger.warn({
      msg: "Falha ao criar a igreja",
      error: result.error.message
    });
    return HttpErrorMapper.map(result.error, reply);
  }
  const sanitizedChurch = ChurchPresenter.toHTTP(result.value);
  logger.info({
    msg: "Igreja criada com sucesso",
    church: sanitizedChurch
  });
  return reply.status(201).send({ church: sanitizedChurch });
}

// src/http/controllers/churches/churches.routes.ts
var import_client7 = require("@prisma/client");

// src/http/schemas/churches/delete-church-schema.ts
var import_zod16 = __toESM(require("zod"));
var publicIdDeleteChurchSchema = import_zod16.default.uuid();
var deleteChurchBodySchema = import_zod16.default.object({
  publicId: publicIdDeleteChurchSchema
});

// src/use-cases/churches/delete-church-use-case.ts
var DeleteChurchUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
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
  const deleteChurchUseCase = new DeleteChurchUseCase(churchesRepository);
  return deleteChurchUseCase;
}

// src/http/controllers/churches/delete-church.controller.ts
async function deleteChurch(request, reply) {
  const { publicId } = deleteChurchBodySchema.parse(request.body);
  logger.info({
    msg: "Deletando uma igreja"
  });
  const deleteChurchUseCase = makeDeleteChurchUseCase();
  const result = await deleteChurchUseCase.execute({
    publicId
  });
  if (isErr(result)) {
    logger.warn({
      msg: "Falha ao deletar a igreja",
      error: result.error.message
    });
    return HttpErrorMapper.map(result.error, reply);
  }
  const sanitizedChurch = ChurchPresenter.toHTTP(result.value.church);
  logger.info({
    msg: "Igreja deletada com sucesso",
    church: sanitizedChurch
  });
  return reply.status(200).send({ church: sanitizedChurch });
}

// src/http/schemas/churches/find-church-by-name-schema.ts
var import_zod17 = __toESM(require("zod"));
var findChurchByNameSchema = import_zod17.default.object({
  name: import_zod17.default.string().min(3, "O nome deve ter no m\xEDnimo 3 caracteres")
});

// src/use-cases/churches/find-church-publicId-by-name-use-case.ts
var FindChurchPublicIdByNameUseCase = class {
  constructor(churchesRepository) {
    this.churchesRepository = churchesRepository;
  }
  async execute({
    name
  }) {
    const result = await this.churchesRepository.findByName(name);
    if (isErr(result)) {
      return result;
    }
    const church = result.value;
    if (!church) {
      return errOf(new ChurchNotFoundError());
    }
    const publicId = church.publicId;
    return ok({ publicId });
  }
};

// src/use-cases/factories/make-find-church-publicId-by-name-use-case.ts
function makeFindChurchPublicIdByNameUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping);
  const churchesRepository = new PrismaChurchesRepository(errorMapper);
  const findChurchPublicIdByNameUseCase = new FindChurchPublicIdByNameUseCase(churchesRepository);
  return findChurchPublicIdByNameUseCase;
}

// src/http/controllers/churches/find-church-publicId-by-name.controller.ts
async function findChurchPublicIdByName(request, reply) {
  const { name } = findChurchByNameSchema.parse(request.body);
  const findChurchPublicIdByNameUseCase = makeFindChurchPublicIdByNameUseCase();
  const result = await findChurchPublicIdByNameUseCase.execute({ name });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.status(200).send({ publicId: result.value.publicId });
}

// src/http/controllers/churches/churches.routes.ts
async function churchesRoutes(app2) {
  app2.get(
    "/nearest",
    {
      config: {
        rateLimit: HTTP_RATE_LIMIT_POLICIES.churches.nearest
      }
    },
    findNearestChurches
  );
  app2.post("/find-church-publicId-by-name", { onRequest: [verifyJwt] }, findChurchPublicIdByName);
  app2.post("/create", { onRequest: [verifyJwt, verifyUserRole([import_client7.UserRole.ADMIN])] }, createChurch);
  app2.delete("/delete", { onRequest: [verifyJwt, verifyUserRole([import_client7.UserRole.ADMIN])] }, deleteChurch);
}

// src/http/routes.ts
async function appRoutes(app2) {
  app2.register(usersRoutes, { prefix: "/users" });
  app2.register(healthCheckRoutes, { prefix: "/health" });
  app2.register(formsRoutes, { prefix: "/forms" });
  app2.register(churchesRoutes, { prefix: "/churches" });
}

// src/app.ts
var import_uuid2 = require("uuid");
var import_zod18 = __toESM(require("zod"));
var import_jwt = __toESM(require("@fastify/jwt"));
var import_cors = __toESM(require("@fastify/cors"));
var Sentry = __toESM(require("@sentry/node"));
var import_profiling_node = require("@sentry/profiling-node");

// src/http/plugins/async-context.plugin.ts
var import_fastify_plugin = __toESM(require_plugin());
var import_uuid = require("uuid");
var asyncContextPlugin = async (app2) => {
  app2.addHook("onRequest", (request, reply, done) => {
    const requestId = (0, import_uuid.v7)();
    const requestInfo = {
      host: request.host,
      protocol: request.protocol,
      userAgent: request.headers["user-agent"] || ""
    };
    asyncLocalStorage2.run(
      {
        requestId,
        requestInfo
      },
      done
    );
  });
};
var asyncContext = (0, import_fastify_plugin.default)(asyncContextPlugin, {
  name: "async-context"
});

// src/http/plugins/rate-limit.plugin.ts
var import_rate_limit5 = __toESM(require("@fastify/rate-limit"));
var import_fastify_plugin2 = __toESM(require_plugin());
var httpRateLimitPlugin = async (app2) => {
  await app2.register(import_rate_limit5.default, {
    global: true,
    max: HTTP_RATE_LIMIT_POLICIES.global.max,
    timeWindow: HTTP_RATE_LIMIT_POLICIES.global.timeWindow,
    hook: "onRequest",
    keyGenerator: (request) => request.ip,
    redis: getRedisRateLimit(),
    skipOnError: true
  });
};
var httpRateLimit = (0, import_fastify_plugin2.default)(httpRateLimitPlugin, {
  name: "http-rate-limit"
});

// src/http/plugins/rate-limit-defaults.plugin.ts
var import_fastify_plugin3 = __toESM(require_plugin());
var rateLimitDefaultsPlugin = async (app2) => {
  app2.addHook("onRoute", (routeOptions) => {
    try {
      if (!routeOptions.config) {
        routeOptions.config = { rateLimit: HTTP_RATE_LIMIT_POLICIES.global };
        return;
      }
      if (routeOptions.config.rateLimit === false) {
        return;
      }
      if (routeOptions.config.rateLimit == null) {
        routeOptions.config.rateLimit = HTTP_RATE_LIMIT_POLICIES.global;
      }
    } catch {
    }
  });
};
var httpRateLimitDefaults = (0, import_fastify_plugin3.default)(rateLimitDefaultsPlugin, {
  name: "http-rate-limit-defaults"
});

// src/app.ts
import_zod18.default.config(import_zod18.default.locales.pt());
var app = (0, import_fastify.default)({
  logger: false,
  trustProxy: true
});
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [(0, import_profiling_node.nodeProfilingIntegration)()],
    tracesSampleRate: 1,
    profileSessionSampleRate: 1,
    profileLifecycle: "trace"
  });
  Sentry.setupFastifyErrorHandler(app);
}
if (env.NODE_ENV === "production") {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;
    if (heapUsedMB > 400) {
      logger.warn({
        msg: "High memory usage detected",
        heapUsedMB: Math.round(heapUsedMB),
        rssMB: Math.round(rssMB),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
      });
    }
  }, 6e4);
}
app.register(asyncContext);
app.register(httpRateLimitDefaults);
app.addHook("onRequest", (request, _reply, done) => {
  const requestId = (0, import_uuid2.v7)();
  const xff = request.headers["x-forwarded-for"];
  const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(",")[0].trim() || request.ip;
  runWithRequestId(requestId, async () => {
    try {
      const decoded = await request.jwtVerify();
      runWithUserContext(decoded.sub, () => {
        logRequestDetails();
        done();
      });
    } catch {
      logRequestDetails();
      done();
    }
    function logRequestDetails() {
      logger.info(
        {
          method: request.method,
          url: request.url,
          ip: clientIp,
          remotePort: request.socket.remotePort,
          userAgent: request.headers["user-agent"]
        },
        "Incoming request"
      );
    }
  });
});
app.addHook("onResponse", (request, reply, done) => {
  logger.info(
    {
      statusCode: reply.statusCode,
      method: request.method,
      url: request.url,
      requestTime: reply.elapsedTime
    },
    "Response sent"
  );
  done();
});
app.register(import_cors.default, {
  origin: env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
  maxAge: 3600
});
app.register(httpRateLimit);
app.register(import_jwt.default, {
  secret: env.JWT_SECRET
});
app.register(appRoutes);
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof import_zod18.ZodError) {
    logger.debug(import_zod18.default.treeifyError(error), "Validation error occurred");
    return reply.status(400).send({ message: messages.validation.invalidData, details: import_zod18.default.treeifyError(error) });
  }
  if (error instanceof SyntaxError) {
    logger.error(error, "JSON inv\xE1lido recebido");
    return reply.status(400).send({ message: messages.validation.invalidJson });
  }
  if (error.statusCode) {
    return reply.status(error.statusCode).send({ message: error.message });
  }
  if (env.NODE_ENV === "development") {
    logError(error, {}, "Unhandled error occurred");
  } else {
    if (env.SENTRY_DSN) {
      Sentry.captureException(error);
    }
    logger.error(error, "Unhandled error occurred");
  }
  reply.status(500).send({ message: messages.errors.internalServer, error: error.message });
});
app.addHook("onClose", async () => {
  logger.info("\u{1F6D1} Shutting down RateLimiter and Redis connections...");
  try {
    await RedisRateLimiter.destroyInstance();
    logger.info("\u2705 RateLimiter destroyed");
  } catch (error) {
    logger.error(error, "\u274C Error destroying RateLimiter");
  }
  try {
    await closeAllRedisConnections();
    logger.info("\u2705 Redis connections closed");
  } catch (error) {
    logger.error(error, "\u274C Error closing Redis connections");
  }
});

// src/server.ts
app.listen({ host: "0.0.0.0", port: env.APP_PORT }).then(() => {
  logger.info(`Server started successfully! Listening on: ${env.APP_PORT}`);
}).catch((err2) => {
  logError(err2, {}, "Failed to start server");
  process.exit(1);
});
