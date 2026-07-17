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

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err2 = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err2.code = "MISSING_DATA";
        throw err2;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err2 = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err2.code = "INVALID_DOTENV_KEY";
          throw err2;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err2 = new Error("INVALID_DOTENV_KEY: Missing key part");
        err2.code = "INVALID_DOTENV_KEY";
        throw err2;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err2 = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err2.code = "INVALID_DOTENV_KEY";
        throw err2;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err2 = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err2.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err2;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err2 = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err2.code = "INVALID_DOTENV_KEY";
          throw err2;
        } else if (decryptionFailed) {
          const err2 = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err2.code = "DECRYPTION_FAILED";
          throw err2;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err2 = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err2.code = "OBJECT_REQUIRED";
        throw err2;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports2, module2) {
    "use strict";
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module2.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports2, module2) {
    "use strict";
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module2.exports = function optionMatcher(args) {
      const options = args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// src/lib/sentry/init.ts
var Sentry = __toESM(require("@sentry/node"));
var import_profiling_node = require("@sentry/profiling-node");

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// src/env/index.ts
var import_zod = require("zod");
var import_ms = __toESM(require("ms"));

// src/messages/constants/env/env.ts
var ENV_CONSTANTS = {
  INVALID_VARIABLES: "Invalid environment variables. Please check your .env file or environment configuration."
};

// src/env/index.ts
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
  // Metrics
  METRICS_ENABLED: import_zod.z.enum(["true", "false"]).transform((v) => v === "true").default(true),
  METRICS_API_PORT: import_zod.z.coerce.number().default(9091),
  METRICS_WORKER_PORT: import_zod.z.coerce.number().default(9092),
  // Grafana (used in docker-compose.monitoring.yml)
  GRAFANA_ADMIN_PASSWORD: import_zod.z.string().min(8),
  // App
  APP_NAME: import_zod.z.string().default("Backend Template Reborn"),
  APP_PORT: import_zod.z.coerce.number().default(3e3),
  JWT_SECRET: import_zod.z.string().min(60, "JWT secret must be at least 60 characters long"),
  FRONTEND_URL: import_zod.z.url().default("http://localhost:5173"),
  HASH_SALT_ROUNDS: import_zod.z.coerce.number().default(12),
  // HTTP rate limits (test overrides supported via env)
  HTTP_RATE_LIMIT_GLOBAL_MAX: import_zod.z.coerce.number().int().positive().default(300),
  HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_SESSION_MAX: import_zod.z.coerce.number().int().positive().default(15),
  HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_REGISTER_MAX: import_zod.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX: import_zod.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW: import_zod.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX: import_zod.z.coerce.number().int().positive().default(5),
  HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW: import_zod.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_USERS_LIST_MAX: import_zod.z.coerce.number().int().positive().default(20),
  HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW: import_zod.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_USERS_DELETE_MAX: import_zod.z.coerce.number().int().positive().default(10),
  HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW: import_zod.z.string().default("1 hour"),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX: import_zod.z.coerce.number().int().positive().default(3e4),
  HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX: import_zod.z.coerce.number().int().positive().default(60),
  HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  HTTP_RATE_LIMIT_HEALTH_CHECK_MAX: import_zod.z.coerce.number().int().positive().default(120),
  HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW: import_zod.z.string().default("1 minute"),
  SENTRY_DSN: import_zod.z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: import_zod.z.coerce.number().min(0).max(1).default(0.2),
  SENTRY_PROFILE_SAMPLE_RATE: import_zod.z.coerce.number().min(0).max(1).default(0.1),
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
  STADIA_MAPS_MATRIX_API_URL: import_zod.z.url().default("https://api.stadiamaps.com/sources_to_targets"),
  STADIA_API_TOKEN: import_zod.z.string().min(1, "STADIA_API_TOKEN is required"),
  COOKIE_SECRET: import_zod.z.string().min(32, "Cookie secret must be at least 32 characters long").default("super-secret-cookie-signing-key-for-local-development-must-be-long")
});
var _env = envSchema.safeParse(process.env);
if (!_env.success) {
  console.error("Vari\xE1veis de ambiente inv\xE1lidas:", import_zod.z.treeifyError(_env.error));
  throw new Error(ENV_CONSTANTS.INVALID_VARIABLES);
}
var env = _env.data;

// src/lib/sentry/init.ts
function initSentry() {
  if (!env.SENTRY_DSN) {
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [(0, import_profiling_node.nodeProfilingIntegration)()],
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profileSessionSampleRate: env.SENTRY_PROFILE_SAMPLE_RATE,
    profileLifecycle: "trace"
  });
}

// src/lib/infra/jobs/outbox-cron.ts
var import_node_cron = __toESM(require("node-cron"));

// src/messages/constants/outbox/outbox.ts
var OUTBOX_CONSTANTS = {
  LOCK_KEYS: {
    OUTBOX_PROCESSOR: "lock:outbox-processor",
    OUTBOX_RECOVERY: "lock:outbox-recovery"
  },
  LOCK_TTL_MS: {
    DEFAULT: 1e4
  },
  THRESHOLDS: {
    /** Time in ms after which a SENDING event is considered stuck (e.g., after a crash) */
    STUCK_SENDING_MS: 3e4,
    /** Maximum number of pending events fetched per processing cycle */
    PENDING_FETCH_LIMIT: 50
  }
};

// src/messages/constants/queue/queue.ts
var QUEUE = {
  NAMES: {
    MAIL: "mail-queue"
  },
  JOBS: {
    OUTBOX_DISPATCH: "outbox-dispatch"
  }
};

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));

// src/lib/async-local-storage/index.ts
var import_node_async_hooks = require("async_hooks");
var asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();

// src/lib/logger/index.ts
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
        REDIS_LOGS.CONNECTION_DEGRADED
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
        REDIS_LOGS.CONNECTION_STILL_DEGRADED
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
      REDIS_LOGS.CONNECTION_RECOVERED
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
      REDIS_LOGS.BULLMQ_UNEXPECTED_ERROR
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
      REDIS_LOGS.CACHE_UNEXPECTED_ERROR
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

// src/messages/constants/logs/worker.ts
var WORKER_LOGS = {
  BATCH_ALREADY_SENT: "Lote j\xE1 enviado anteriormente. Limpando DB e abortando duplicata.",
  BULLMQ_NETWORK_GLITCH: "Falha de rede interna do BullMQ ap\xF3s processamento. Ignorando.",
  GENERIC_WORKER_FAILURE: "Falha gen\xE9rica n\xE3o mapeada no worker",
  MAIL_QUEUE_ERROR: "Erro na MailQueue (Producer)"
};

// src/lib/queue/mail-queue.ts
var mailQueueInstance = null;
function getMailQueue() {
  if (!mailQueueInstance) {
    const redisForQueue = getRedisForQueue();
    attachRedisLogger(redisForQueue, QUEUE.NAMES.MAIL);
    mailQueueInstance = new import_bullmq.Queue(QUEUE.NAMES.MAIL, {
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
    const redisCache = getRedisCache();
    try {
      const result = await redisCache.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs));
      const renewed = result === 1;
      if (!renewed) {
        logger.warn({ key }, LOCK_LOGS.RENEW_EXPIRED);
      }
      return renewed;
    } catch (error) {
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
    const redisCache = getRedisCache();
    try {
      const result = await redisCache.eval(RELEASE_SCRIPT, 1, key, token);
      if (result === 0) {
        logger.warn({ key }, LOCK_LOGS.RELEASE_EXPIRED);
      }
    } catch (error) {
      logger.warn({ error, key }, LOCK_LOGS.RELEASE_FAILED);
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
function contactStaffTextTemplate(name, email, ipAddress) {
  const ipSection = ipAddress ? `
IP de origem: ${ipAddress}` : "";
  return `
            ${name} <${email}> enviou um formul\xE1rio.${ipSection}
        `;
}

// src/templates/contact-staff/contact-staff-html.ts
function contactStaffHtmlTemplate(name, lastName, email, ipAddress) {
  const ipRow = ipAddress ? `<p><strong>IP de origem:</strong> ${ipAddress}</p>` : "";
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
                            ${ipRow}
                        </td>
                    </tr>
                </table>
            </div>
        `;
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

// src/errors/domain-error.ts
var DomainError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type, failureMode) {
    super(detail, type, failureMode);
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

// src/use-cases/forms/strategies/contact-email-strategy.ts
var ContactEmailStrategy = class {
  buildUserEmail(form) {
    const emailResult = this.getStringField(form.email, "form.email");
    if (isErr(emailResult)) return emailResult;
    const nameResult = this.getStringField(form.name, "form.name");
    if (isErr(nameResult)) return nameResult;
    const email = emailResult.value;
    const name = nameResult.value;
    return ok({
      to: email,
      subject: contactUserSubjectTextTemplate(name),
      message: contactUserTextTemplate(name),
      html: contactUserHtmlTemplate(name),
      context: { type: "contact", recipient: "user" }
    });
  }
  buildStaffEmail(form) {
    const emailResult = this.getStringField(form.email, "form.email");
    if (isErr(emailResult)) return emailResult;
    const nameResult = this.getStringField(form.name, "form.name");
    if (isErr(nameResult)) return nameResult;
    const lastNameResult = this.getOptionalStringField(form.lastName, "form.lastName");
    if (isErr(lastNameResult)) return lastNameResult;
    const email = emailResult.value;
    const name = nameResult.value;
    const lastName = lastNameResult.value;
    const ipAddress = typeof form.ipAddress === "string" ? form.ipAddress : void 0;
    return ok({
      to: env.ADMIN_EMAIL,
      subject: contactStaffSubjectTextTemplate(),
      message: contactStaffTextTemplate(name, email, ipAddress),
      html: contactStaffHtmlTemplate(name, lastName, email, ipAddress),
      context: { type: "contact", recipient: "internal" }
    });
  }
  getStringField(value, fieldName) {
    if (typeof value === "string") {
      return ok(value);
    }
    return err(new InvalidFormPayloadError(fieldName));
  }
  getOptionalStringField(value, fieldName) {
    if (value === void 0 || typeof value === "string") {
      return ok(value || "");
    }
    return err(new InvalidFormPayloadError(fieldName));
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
function decisionForChristStaffTextTemplate(name, email, ipAddress) {
  const ipSection = ipAddress ? `
IP de origem: ${ipAddress}` : "";
  return `
            ${name} <${email}> aceitou a Cristo.${ipSection}
        `;
}

// src/templates/decision-for-christ-staff/decision-for-christ-staff-html.ts
function decisionForChristStaffHtmlTemplate(name, lastName, email, location, ipAddress) {
  const ipSection = ipAddress ? `
                <li>
                    IP de origem: ${ipAddress}
                </li>` : "";
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
                ${ipSection}
            </ul>
        `;
}

// src/use-cases/forms/strategies/decision-for-christ-email-strategy.ts
var DecisionForChristEmailStrategy = class {
  buildUserEmail(form) {
    const emailResult = this.getStringField(form.email, "form.email");
    if (isErr(emailResult)) return emailResult;
    const nameResult = this.getStringField(form.name, "form.name");
    if (isErr(nameResult)) return nameResult;
    const email = emailResult.value;
    const name = nameResult.value;
    return ok({
      to: email,
      subject: decisionForChristUserSubjectText(),
      message: decisionForChristUserTextTemplate(name),
      html: decisionForChristUserHtmlTemplate(name),
      context: { type: "decision-for-Christ", recipient: "user" }
    });
  }
  buildStaffEmail(form) {
    const emailResult = this.getStringField(form.email, "form.email");
    if (isErr(emailResult)) return emailResult;
    const nameResult = this.getStringField(form.name, "form.name");
    if (isErr(nameResult)) return nameResult;
    const lastNameResult = this.getStringField(form.lastName, "form.lastName");
    if (isErr(lastNameResult)) return lastNameResult;
    const locationResult = this.getOptionalStringField(form.location, "form.location");
    if (isErr(locationResult)) return locationResult;
    const email = emailResult.value;
    const name = nameResult.value;
    const lastName = lastNameResult.value;
    const location = locationResult.value;
    const ipAddress = typeof form.ipAddress === "string" ? form.ipAddress : void 0;
    return ok({
      to: env.ADMIN_EMAIL,
      subject: decisionForChristStaffSubjectText(),
      message: decisionForChristStaffTextTemplate(name, email, ipAddress),
      html: decisionForChristStaffHtmlTemplate(name, lastName, email, location, ipAddress),
      context: { type: "decision-for-Christ", recipient: "internal" }
    });
  }
  getStringField(value, fieldName) {
    if (typeof value === "string") {
      return ok(value);
    }
    return err(new InvalidFormPayloadError(fieldName));
  }
  getOptionalStringField(value, fieldName) {
    if (value === void 0 || typeof value === "string") {
      return ok(value || "");
    }
    return err(new InvalidFormPayloadError(fieldName));
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
  SCHEDULER_CONFIGURED: "Agendador da Outbox configurado para 00:00 diariamente.",
  // outbox-processor
  SKIPPED_ANOTHER_RUNNING: "processEvents: Processamento ignorado. Outra inst\xE2ncia j\xE1 est\xE1 rodando.",
  PENDING_FETCH_ERROR: "Erro de Infra ao buscar eventos pendentes.",
  STUCK_FETCH_ERROR: "Erro de Infra ao buscar eventos travados na Outbox.",
  STATUS_UPDATE_FAILED: "Falha ao atualizar status para SENDING. Evento permanece em PENDING.",
  REVERT_FATAL: "FATAL: Falha ao reverter status para PENDING. Inconsist\xEAncia na DB.",
  DISPATCH_REVERTED: "Falha no dispatch, revertido para PENDING",
  CRITICAL_LOOP_ERROR: "Erro cr\xEDtico inesperado no loop principal de processEvents",
  CRITICAL_RECOVERY_ERROR: "Erro cr\xEDtico inesperado no recoverStuckSendingEvents"
};

// src/lib/infra/jobs/outbox-processor.ts
var OutboxProcessor = class {
  constructor(outboxRepository) {
    this.outboxRepository = outboxRepository;
  }
  LOCK_KEY = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_PROCESSOR;
  LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT;
  async processEvents() {
    let lockToken = null;
    try {
      lockToken = await DistributedLock.acquire(this.LOCK_KEY, this.LOCK_TTL_MS);
      if (!lockToken) {
        logger.warn(OUTBOX_LOGS.SKIPPED_ANOTHER_RUNNING);
        return;
      }
      const pendingEventsResult = await this.outboxRepository.findPending(OUTBOX_CONSTANTS.THRESHOLDS.PENDING_FETCH_LIMIT);
      if (isErr(pendingEventsResult)) {
        logger.error({ error: pendingEventsResult.error }, OUTBOX_LOGS.PENDING_FETCH_ERROR);
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
      logger.error({ error }, OUTBOX_LOGS.CRITICAL_LOOP_ERROR);
    } finally {
      if (lockToken) {
        await DistributedLock.release(this.LOCK_KEY, lockToken);
      }
    }
  }
  async recoverStuckSendingEvents() {
    let lockToken = null;
    try {
      lockToken = await DistributedLock.acquire(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, this.LOCK_TTL_MS);
      if (!lockToken) return;
      const thresholdDate = new Date(Date.now() - OUTBOX_CONSTANTS.THRESHOLDS.STUCK_SENDING_MS);
      const stuckEventsResult = await this.outboxRepository.findStuck(thresholdDate);
      if (isErr(stuckEventsResult)) {
        logger.error({ error: stuckEventsResult.error }, OUTBOX_LOGS.STUCK_FETCH_ERROR);
        return;
      }
      const stuckEvents = stuckEventsResult.value;
      if (stuckEvents.length > 0) {
        logger.warn(`Encontrados ${stuckEvents.length} eventos travados em SENDING. Iniciando recupera\xE7\xE3o...`);
        for (const event of stuckEvents) {
          await DistributedLock.renew(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken, this.LOCK_TTL_MS);
          await this.processSingleEvent(event);
        }
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.CRITICAL_RECOVERY_ERROR);
    } finally {
      if (lockToken) {
        await DistributedLock.release(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RECOVERY, lockToken);
      }
    }
  }
  async processSingleEvent(event) {
    const updateResult = await this.outboxRepository.updateStatus(event.publicId, "SENDING" /* SENDING */);
    if (isErr(updateResult)) {
      logger.error({ publicId: event.publicId, error: updateResult.error }, OUTBOX_LOGS.STATUS_UPDATE_FAILED);
      return;
    }
    try {
      await this.dispatchToBullMQ(event);
    } catch (error) {
      const revertResult = await this.outboxRepository.updateStatus(event.publicId, "PENDING" /* PENDING */);
      if (isErr(revertResult)) {
        logger.error({ publicId: event.publicId, error: revertResult.error }, OUTBOX_LOGS.REVERT_FATAL);
      } else {
        logger.error({ publicId: event.publicId, error }, OUTBOX_LOGS.DISPATCH_REVERTED);
      }
    }
  }
  async dispatchToBullMQ(event) {
    const payload = event.payload;
    const strategy = payload.decisaoPorCristo ? new DecisionForChristEmailStrategy() : new ContactEmailStrategy();
    const userJobResult = strategy.buildUserEmail(payload);
    if (isErr(userJobResult)) {
      throw userJobResult.error;
    }
    const staffJobResult = strategy.buildStaffEmail(payload);
    if (isErr(staffJobResult)) {
      throw staffJobResult.error;
    }
    await getMailQueue().add(
      QUEUE.JOBS.OUTBOX_DISPATCH,
      {
        publicId: event.publicId,
        emails: [userJobResult.value, staffJobResult.value]
      },
      { jobId: event.publicId }
    );
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
          ...status === "SENDING" /* SENDING */ && { sendingAt: /* @__PURE__ */ new Date() }
        }
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
      occurredAt: raw.occurredAt,
      sendingAt: raw.sendingAt || void 0
    };
  }
};

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client = require("@prisma/client");

// src/errors/infrastructure-error.ts
var InfrastructureError = class extends AppError {
  originalError;
  constructor(detail, originalError, type = "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */, failureMode) {
    super(detail, type, failureMode);
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

// src/errors/system-error.ts
var SystemError = class extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail, type) {
    super(detail, type);
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

// src/messages/errors/system.ts
var SYSTEM_ERRORS = {
  ASYNC_LOCAL_STORAGE_NOT_INITIALIZED: {
    code: "ASYNC_LOCAL_STORAGE_NOT_INITIALIZED",
    message: "Async Local Storage is not initialized."
  }
};

// src/lib/errors/async-local-storage/async-local-storage-not-initialized-error.ts
var AsyncLocalStorageNotInitializedError = class extends SystemError {
  constructor() {
    super(SYSTEM_ERRORS.ASYNC_LOCAL_STORAGE_NOT_INITIALIZED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
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

// src/messages/constants/cron/cron.ts
var CRON_SCHEDULES = {
  /** Every day at midnight (00:00:00) */
  MIDNIGHT_DAILY: "0 0 0 * * *"
};

// src/lib/infra/jobs/outbox-cron.ts
function startOutboxCron(existingProcessor) {
  import_node_cron.default.schedule(CRON_SCHEDULES.MIDNIGHT_DAILY, async () => {
    logger.info(OUTBOX_LOGS.CRON_START);
    const processor = existingProcessor ?? buildProcessor();
    try {
      await processor.recoverStuckSendingEvents();
      logger.info(OUTBOX_LOGS.PHASE1_DONE);
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE1_ERROR);
    }
    try {
      await processor.processEvents();
      logger.info(OUTBOX_LOGS.PHASE2_DONE);
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE2_ERROR);
    }
    logger.info(OUTBOX_LOGS.SCAN_DONE);
  });
  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED);
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
  async execute({
    to,
    subject,
    message,
    html,
    attachments
  }) {
    try {
      const info = await sendEmail({ to, subject, message, html, attachments });
      return ok(info);
    } catch (error) {
      return err(new SmtpDispatchError(error));
    }
  }
};

// src/use-cases/factories/make-send-email-use-case.ts
function makeSendEmailUseCase() {
  return new SendEmailUseCase();
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

// src/messages/constants/workers/workers.ts
var WORKER_CONSTANTS = {
  MAIL: {
    CONCURRENCY_LIMIT: 5,
    LOCK_DURATION_MS: 3e5,
    STALLED_INTERVAL_MS: 3e5
  },
  QUEUE: {
    JOB_ATTEMPTS: 3,
    BACKOFF_TYPE: "exponential",
    BACKOFF_DELAY_MS: 1e4
  },
  IDEMPOTENCY_TTL: {
    PROCESSING_SECONDS: 300,
    COMPLETED_SECONDS: 86400
  }
};

// src/lib/workers/mail-worker.ts
async function startMailWorker(outboxRepository) {
  const workerConnection = createWorkerConnection();
  attachRedisLogger(workerConnection, "MailWorker");
  const worker2 = new import_bullmq2.Worker(
    QUEUE.NAMES.MAIL,
    async (job) => {
      const { publicId, emails } = job.data;
      const childLogger = logger.child({ jobId: job.id, publicId });
      const redisCache = getRedisCache();
      const idempotencyKey = `${REDIS_CONSTANTS.KEYS.IDEMPOTENCY_EMAIL_PREFIX}${publicId}`;
      const acquired = await redisCache.set(
        idempotencyKey,
        "processing",
        "EX",
        WORKER_CONSTANTS.IDEMPOTENCY_TTL.PROCESSING_SECONDS,
        "NX"
      );
      if (!acquired) {
        const status = await redisCache.get(idempotencyKey);
        if (status === "completed") {
          childLogger.warn(WORKER_LOGS.BATCH_ALREADY_SENT);
          const deleteResult = await outboxRepository.delete(publicId);
          if (isErr(deleteResult)) {
            throw deleteResult.error;
          }
          return;
        }
        throw new JobAlreadyProcessingError();
      }
      try {
        childLogger.info(`Processando lote de ${emails.length} e-mails...`);
        const sendEmailUseCase = makeSendEmailUseCase();
        const results = await Promise.all(emails.map((email) => sendEmailUseCase.execute(email)));
        const failedResult = results.find((r) => isErr(r));
        if (failedResult && isErr(failedResult)) {
          throw failedResult.error;
        }
        childLogger.info("Lote de e-mails processado com sucesso.");
        await redisCache.set(idempotencyKey, "completed", "EX", WORKER_CONSTANTS.IDEMPOTENCY_TTL.COMPLETED_SECONDS);
        const deleteResult = await outboxRepository.delete(publicId);
        if (isErr(deleteResult)) {
          throw deleteResult.error;
        }
        childLogger.info("OutboxEvent deletado com sucesso do banco de dados");
      } catch (err2) {
        await redisCache.del(idempotencyKey);
        if (err2 instanceof InfrastructureError) {
          throw err2;
        }
        throw new SmtpDispatchError(err2);
      }
    },
    {
      connection: workerConnection,
      concurrency: WORKER_CONSTANTS.MAIL.CONCURRENCY_LIMIT,
      lockDuration: WORKER_CONSTANTS.MAIL.LOCK_DURATION_MS,
      stalledInterval: WORKER_CONSTANTS.MAIL.STALLED_INTERVAL_MS
    }
  );
  worker2.on("failed", (job, err2) => {
    if (err2.message.includes("Missing lock") || err2.message.includes("job stalled")) {
      logger.warn({ jobId: job?.id }, WORKER_LOGS.BULLMQ_NETWORK_GLITCH);
      return;
    }
    const isInfrastructureError = "body" in err2 && "statusCode" in err2;
    if (isInfrastructureError) {
      const infraError = err2;
      logger.error(
        {
          jobId: job?.id,
          code: infraError.body.code,
          cause: infraError.cause
        },
        `Falha de Infraestrutura: ${infraError.message}`
      );
      return;
    }
    logger.error({ jobId: job?.id, err: err2.message }, WORKER_LOGS.GENERIC_WORKER_FAILURE);
  });
  return worker2;
}

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
    publisher.on("connect", () => logger.info(OUTBOX_LOGS.PUBLISHER_CONNECTED));
    publisher.on("error", (err2) => logger.error({ err: err2 }, OUTBOX_LOGS.PUBLISHER_ERROR));
    publisher.on("close", () => logger.warn(OUTBOX_LOGS.PUBLISHER_CLOSED));
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
    subscriber.on("connect", () => logger.info(OUTBOX_LOGS.SUBSCRIBER_CONNECTED));
    subscriber.on("error", (err2) => logger.error({ err: err2 }, OUTBOX_LOGS.SUBSCRIBER_ERROR));
    subscriber.on("close", () => logger.warn(OUTBOX_LOGS.SUBSCRIBER_CLOSED));
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
      await client.publish(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId, event }));
    } catch (err2) {
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
      activeMessageListener = async (channel, message) => {
        if (channel !== REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL) {
          logger.warn({ channel }, OUTBOX_LOGS.UNEXPECTED_CHANNEL);
          return;
        }
        try {
          const parsed = JSON.parse(message);
          await onSignal(parsed.publicId, parsed.event);
        } catch (err2) {
          logger.error({ err: err2, publicId: message }, OUTBOX_LOGS.SIGNAL_PROCESSING_ERROR);
        }
      };
      client.on("message", activeMessageListener);
      await client.subscribe(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL);
    } catch (err2) {
      logger.error({ err: err2 }, OUTBOX_LOGS.SUBSCRIBE_ERROR);
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

// src/lib/shutdown/crash-shutdown.ts
var Sentry2 = __toESM(require("@sentry/node"));
var isShuttingDown = false;
async function crashShutdown(error, cleanup2) {
  if (isShuttingDown) {
    process.exit(1);
    return void 0;
  }
  isShuttingDown = true;
  logger.fatal({ err: error }, "Travamento n\xE3o tratado detectado, iniciando sequ\xEAncia de encerramento por falha...");
  const hardTimeout = setTimeout(() => {
    logger.fatal("O tempo limite de limpeza para encerramento expirou ap\xF3s 15s. For\xE7ando a sa\xEDda.");
    process.exit(1);
  }, 15e3);
  hardTimeout.unref();
  try {
    await cleanup2();
    logger.info("Limpeza de encerramento por travamento conclu\xEDda com sucesso.");
  } catch (cleanupError) {
    logger.error({ err: cleanupError }, "Ocorreu um erro durante a limpeza de encerramento por travamento");
  }
  try {
    if (error instanceof Error) {
      Sentry2.captureException(error);
    } else {
      Sentry2.captureException(new Error(String(error)));
    }
    await Sentry2.flush(2e3);
    logger.info("Logs do Sentry enviados com sucesso.");
  } catch (sentryError) {
    logger.error({ err: sentryError }, "Erro ao enviar os logs do Sentry durante o encerramento por travamento");
  } finally {
    clearTimeout(hardTimeout);
    process.exit(1);
  }
}

// src/metrics-server.ts
var import_fastify = __toESM(require("fastify"));
var import_prom_client3 = require("prom-client");

// src/lib/metrics/index.ts
var import_prom_client = require("prom-client");
var import_prom_client2 = require("prom-client");
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

// src/metrics-server.ts
var metricsServer = null;
var registry2 = getRegistry();
var metricsCollectionErrors = registry2 ? new import_prom_client3.Counter({
  name: "metrics_collection_errors_total",
  help: "Errors during metrics collection",
  labelNames: ["source"],
  registers: [registry2]
}) : null;
function withTimeout(promise, ms2, source) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        metricsCollectionErrors?.inc({ source });
        reject(new Error(`${source} timeout`));
      }, ms2);
    })
  ]);
}
async function startMetricsServer(options) {
  if (!env.METRICS_ENABLED) {
    logger.info("Metrics server disabled");
    return;
  }
  metricsServer = (0, import_fastify.default)({ logger: false });
  metricsServer.get("/metrics", async (_request, reply) => {
    const currentRegistry = getRegistry();
    if (!currentRegistry) {
      return reply.status(503).send("Metrics disabled");
    }
    const results = await Promise.allSettled([withTimeout(currentRegistry.metrics(), 2e3, "prom-client")]);
    const output = results.filter((r) => r.status === "fulfilled").map((r) => r.value).join("\n\n");
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return output;
  });
  metricsServer.get("/health", async () => ({ status: "ok" }));
  await metricsServer.listen({ host: "0.0.0.0", port: options.port });
  logger.info({ port: options.port }, "Metrics server started");
}
async function stopMetricsServer() {
  if (metricsServer) {
    await metricsServer.close();
    metricsServer = null;
    logger.info("Metrics server stopped");
  }
}

// src/worker.ts
initSentry();
var worker = null;
var shuttingDown = false;
async function bootstrap() {
  try {
    logger.info("Inicializando servi\xE7os de background...");
    const dbContext = new DatabaseContext();
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping);
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping);
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper);
    worker = await startMailWorker(outboxRepository);
    logger.info("Mail worker iniciado");
    const outboxProcessor = new OutboxProcessor(outboxRepository);
    await OutboxSignal.subscribe(async (publicId, event) => {
      await outboxProcessor.processSingleEvent(event);
    });
    startOutboxCron(outboxProcessor);
    try {
      await startMetricsServer({ port: env.METRICS_WORKER_PORT });
    } catch (metricsErr) {
      logger.error(
        { err: metricsErr },
        "Falha ao iniciar o servidor de m\xE9tricas do worker; o worker continuar\xE1 sem m\xE9tricas"
      );
    }
  } catch (error) {
    await crashShutdown(error, cleanup);
  }
}
async function cleanup() {
  try {
    await OutboxSignal.disconnect();
    logger.info("OutboxSignal desconectado com sucesso");
  } catch (err2) {
    logger.error(err2, "Erro ao desconectar o OutboxSignal");
  }
  if (worker) {
    try {
      await worker.close();
      logger.info("Worker finalizado com sucesso");
    } catch (err2) {
      logger.error(err2, "Erro ao finalizar o worker");
    }
  }
  try {
    await stopMetricsServer();
  } catch (err2) {
    logger.error(err2, "Erro ao finalizar o servidor de m\xE9tricas do worker");
  }
}
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Recebido sinal ${signal}. Iniciando graceful shutdown do worker...`);
  await cleanup();
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
process.on("unhandledRejection", (reason) => {
  crashShutdown(reason, cleanup);
});
process.on("uncaughtException", (error) => {
  crashShutdown(error, cleanup);
});
bootstrap();
