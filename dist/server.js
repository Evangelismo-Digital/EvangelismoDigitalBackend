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
    var crypto2 = require("crypto");
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
        const aesgcm = crypto2.createDecipheriv("aes-256-gcm", key, nonce);
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

// src/repositories/prisma/prisma-users-repository.ts
var PrismaUsersRepository = class {
  constructor(errorMapper, dbContext = new DatabaseContext()) {
    this.errorMapper = errorMapper;
    this.dbContext = dbContext;
  }
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
      const conditions = [];
      if (where.id !== void 0) conditions.push({ id: where.id });
      if (where.publicId !== void 0) conditions.push({ publicId: where.publicId });
      if (where.email !== void 0) conditions.push({ email: where.email });
      if (where.username !== void 0) conditions.push({ username: where.username });
      if (where.cpf !== void 0) conditions.push({ cpf: where.cpf });
      if (where.token !== void 0) conditions.push({ token: where.token });
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
        skip: (page - 1) * 20,
        take: 20
      });
      return ok(users);
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error));
    }
  }
  async update(publicId, data) {
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
  async updatePassword(publicId, data) {
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

// src/lib/prisma/utils/prisma-error-mapper.ts
var import_client2 = require("@prisma/client");

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

// src/http/schemas/utils/password.ts
var passwordSchema = import_zod2.z.string().trim().min(8, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_SHORT }).max(64, { message: VALIDATION_CONSTANTS.PASSWORD.TOO_LONG }).regex(/[A-Z]/, { message: VALIDATION_CONSTANTS.PASSWORD.UPPERCASE }).regex(/[a-z]/, { message: VALIDATION_CONSTANTS.PASSWORD.LOWERCASE }).regex(/[0-9]/, { message: VALIDATION_CONSTANTS.PASSWORD.DIGIT }).regex(/[\W_]/, { message: VALIDATION_CONSTANTS.PASSWORD.SPECIAL }).refine((val) => !val.includes(" "), { message: VALIDATION_CONSTANTS.PASSWORD.NO_SPACES });

// src/http/schemas/users/reset-password-schema.ts
var resetPasswordSchema = import_zod3.z.object({
  password: passwordSchema,
  token: import_zod3.z.string()
});

// src/lib/logger/index.ts
var import_pino = __toESM(require("pino"));
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
  ["OK" /* OK */]: 200,
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
    if (error instanceof DomainError) {
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

// src/messages/constants/auth/auth.ts
var AUTH_CONSTANTS = {
  PASSWORD_CHANGED_SUCCESS: "Password changed successfully!"
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
  logger.info({ userId: user.publicId }, AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS);
  return reply.status(200).send({ message: AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS });
}

// src/http/schemas/users/register-schema.ts
var import_zod7 = require("zod");

// src/http/schemas/utils/cpf.ts
var import_zod4 = require("zod");
var import_cpf_cnpj_validator = require("cpf-cnpj-validator");
var cpfSchema = import_zod4.z.preprocess(
  (val) => typeof val === "string" ? val.replace(/\D/g, "") : val,
  import_zod4.z.string().length(11, { message: VALIDATION_CONSTANTS.CPF.INVALID }).refine(import_cpf_cnpj_validator.cpf.isValid, { message: VALIDATION_CONSTANTS.CPF.INVALID }).transform(import_cpf_cnpj_validator.cpf.format)
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
    super(USER_ERRORS.NOT_CREATED, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
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
    const userWithExistingParams = await this.usersRepository.findBy({ email, cpf: cpf2, username });
    if (isErr(userWithExistingParams)) {
      return userWithExistingParams;
    }
    if (userWithExistingParams.value) {
      return err(new UserAlreadyExistsError());
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
  logger.info({ userId: user.publicId }, "Usu\xE1rio comum registrado com sucesso!");
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
  logger.info({ userId: user.publicId }, "Usu\xE1rio administrador registrado com sucesso!");
  return reply.status(201).send({ user: UserPresenter.toHTTP(user) });
}

// src/http/middlewares/verify-jwt.middleware.ts
async function verifyJwt(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
  }
}

// src/http/middlewares/verify-user-role.middleware.ts
function verifyUserRole(allowedRoles) {
  return async (request, reply) => {
    const { role } = request.user;
    if (!role) {
      return reply.status(401).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
    }
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({ message: AUTH_ERRORS.FORBIDDEN.message });
    }
  };
}

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
      return err(new InvalidCredentialsError());
    }
    const hashToCompare = user.passwordHash;
    const doesPasswordMatch = await (0, import_bcryptjs3.compare)(password, hashToCompare);
    if (!doesPasswordMatch) {
      await this.authenticationAuditUseCase.execute({
        ...auditContext,
        status: import_client3.AuthenticationStatus.INCORRECT_PASSWORD,
        userId: user.id
      });
      return err(new InvalidCredentialsError());
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
      return err(new DatabaseQueryError(error));
    }
  }
};

// src/use-cases/authentication-audit/authentication-audit.ts
var AuthenticationAuditUseCase = class {
  constructor(authenticationAuditRepository) {
    this.authenticationAuditRepository = authenticationAuditRepository;
  }
  async execute(data) {
    const result = await this.authenticationAuditRepository.create(data);
    if (isErr(result)) {
      logger.error({ error: result.error.message }, "Falha ao criar registro de auditoria de autentica\xE7\xE3o");
      return result;
    }
    return ok(void 0);
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
function getAuthenticationAuditContext(request) {
  return {
    ipAddress: request.ip,
    remotePort: request.socket.remotePort?.toString() ?? null,
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
    origin: typeof request.headers.origin === "string" ? request.headers.origin : null
  };
}
async function authenticateUser(request, reply) {
  const { login, password } = authenticateSchema.parse(request.body);
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
  const deleteUserUseCase = new DeleteUserUseCase(usersRepository);
  return deleteUserUseCase;
}

// src/http/schemas/utils/public-id-schema.ts
var import_zod9 = require("zod");
var publicIdSchema = import_zod9.z.object({
  publicId: import_zod9.z.uuid()
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
  logger.info("Usu\xE1rio deletado com sucesso!");
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
  logger.info({ targetId: publicId }, "Usu\xE1rio deletado com sucesso!");
  return reply.status(204).send();
}

// src/http/schemas/users/forgot-password-schema.ts
var import_zod10 = require("zod");
var forgotPasswordSchema = import_zod10.z.object({
  email: emailSchema
});

// src/use-cases/users/forgot-password.ts
var import_crypto = require("crypto");

// src/use-cases/errors/user-not-found-for-password-reset-error.ts
var UserNotFoundForPasswordResetError = class extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_FOUND_FOR_PASSWORD_RESET, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/messages/errors/email.ts
var EMAIL_ERRORS = {
  FAILED_TO_SEND: {
    code: "FAILED_TO_SEND_EMAIL",
    message: "N\xE3o foi poss\xEDvel enviar o e-mail. Por favor, tente novamente."
  }
};

// src/use-cases/errors/failed-to-send-email-error.ts
var FailedToSendEmailError = class extends DomainError {
  constructor() {
    super(EMAIL_ERRORS.FAILED_TO_SEND, "INTERNAL_SERVER_ERROR" /* INTERNAL_SERVER_ERROR */);
  }
};

// src/messages/constants/email/email.ts
var EMAIL_CONSTANTS = {
  PASSWORD_RECOVERY_SUBJECT: "Recupera\xE7\xE3o de senha",
  PASSWORD_RESET_GENERIC_MESSAGE: "Se o usu\xE1rio existir, voc\xEA receber\xE1 um e-mail com instru\xE7\xF5es para redefinir a senha."
};

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

// src/use-cases/users/forgot-password.ts
var EXPIRES_IN_MINUTES = 15;
var TOKEN_LENGTH = 32;
var ForgotPasswordUseCase = class {
  constructor(usersRepository, sendEmailUseCase) {
    this.usersRepository = usersRepository;
    this.sendEmailUseCase = sendEmailUseCase;
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
      return err(new UserNotFoundForPasswordResetError());
    }
    const passwordToken = (0, import_crypto.randomBytes)(TOKEN_LENGTH).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60 * 1e3);
    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      token: passwordToken,
      tokenExpiresAt
    });
    if (isErr(updateResult)) {
      return updateResult;
    }
    const user = updateResult.value;
    if (!user) {
      return err(new UserNotFoundForPasswordResetError());
    }
    const emailResult = await this.sendEmailUseCase.execute({
      to: user.email,
      subject: EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT,
      message: forgotPasswordTextTemplate(user.name, passwordToken),
      html: forgotPasswordHtmlTemplate(user.name, passwordToken)
    });
    if (isErr(emailResult)) {
      await this.usersRepository.updatePassword(user.publicId, {
        token: null,
        tokenExpiresAt: null
      });
      return err(new FailedToSendEmailError());
    }
    return ok({
      user,
      token: passwordToken
    });
  }
};

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

// src/use-cases/factories/make-forgot-password-use-case.ts
function makeForgotPasswordUseCase() {
  const errorMapper = new PrismaErrorMapper(userPrismaErrorMapping);
  const usersRepository = new PrismaUsersRepository(errorMapper);
  const sendEmailUseCase = new SendEmailUseCase();
  const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository, sendEmailUseCase);
  return forgotPasswordUseCase;
}

// src/http/controllers/users/forgot-password.controller.ts
async function forgotPassword(request, reply) {
  const { email } = forgotPasswordSchema.parse(request.body);
  if (!email) {
    return reply.status(200).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE });
  }
  const forgotPasswordUseCase = makeForgotPasswordUseCase();
  const result = await forgotPasswordUseCase.execute({ email });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.status(200).send({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE });
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
      return err(new UserNotFoundError());
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
  logger.info("Perfil do usu\xE1rio obtido com sucesso!");
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
  logger.info("Usu\xE1rio obtido com sucesso!");
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
      return err(new UserNotFoundError());
    }
    const data = {};
    if (name !== void 0) data.name = name;
    if (email !== void 0) data.email = email;
    if (username !== void 0) data.username = username;
    data.updatedAt = /* @__PURE__ */ new Date();
    if (email !== void 0) {
      const emailResult = await this.usersRepository.findBy({ email });
      if (isErr(emailResult)) {
        return emailResult;
      }
      const userWithExistingEmail = emailResult.value;
      if (userWithExistingEmail && userWithExistingEmail.publicId !== userToBeUpdated.publicId) {
        return err(new UserAlreadyExistsError());
      }
    }
    if (username !== void 0) {
      const usernameResult = await this.usersRepository.findBy({ username });
      if (isErr(usernameResult)) {
        return usernameResult;
      }
      const usernameWithExistingUsername = usernameResult.value;
      if (usernameWithExistingUsername && usernameWithExistingUsername.publicId !== userToBeUpdated.publicId) {
        return err(new UserAlreadyExistsError());
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
var import_zod11 = require("zod");
var updateSchema = import_zod11.z.object({
  name: import_zod11.z.string().trim().min(4).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.optional()
});

// src/http/controllers/users/update-user.controller.ts
async function updateUser(request, reply) {
  const { name, username, email } = updateSchema.parse(request.body);
  const authUser = request.user;
  const publicId = authUser?.publicId ?? authUser?.sub;
  if (!publicId) {
    return reply.status(401).send({ message: AUTH_ERRORS.UNAUTHORIZED.message });
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
  return reply.status(200).send(UserPresenter.toHTTP(user));
}

// src/http/controllers/users/users.routes.ts
var import_client4 = require("@prisma/client");

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
    const users = listResult.value || [];
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
  logger.info("Usu\xE1rios obtidos com sucesso!");
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
    const users = searchResult.value || [];
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

// src/http/schemas/users/search-users-schema.ts
var import_zod12 = require("zod");
var searchUsersSchema = import_zod12.z.object({
  query: import_zod12.z.string().optional().default(""),
  page: import_zod12.z.coerce.number().int().positive().default(1)
});

// src/http/controllers/users/search-users.controller.ts
async function searchUsersController(request, reply) {
  const { query, page } = searchUsersSchema.parse(request.query);
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
  health: {
    check: {
      max: env.HTTP_RATE_LIMIT_HEALTH_CHECK_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW,
      skipOnError: true
    }
  }
};

// src/http/controllers/users/users.routes.ts
async function usersRoutes(app2) {
  app2.post(
    "/register/admin",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.auth.register }
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
      onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.list }
    },
    listUsers
  );
  app2.get("/search", { onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])] }, searchUsersController);
  app2.patch("/:publicId", { onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])] }, updateUser);
  app2.delete(
    "/:publicId",
    {
      onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.users.delete }
    },
    deleteUserByPublicId
  );
  app2.get("/:publicId", { onRequest: [verifyJwt, verifyUserRole([import_client4.UserRole.ADMIN])] }, getUserByPublicId);
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

// src/messages/constants/health-check/health-check.ts
var HEALTH_CHECK_CONSTANTS = {
  INTERNAL_ERROR: "Internal healthcheck error"
};

// src/http/controllers/health-check/health-check.controller.ts
async function healthCheck(_request, reply) {
  const memoryUsage = process.memoryUsage();
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const uptime = process.uptime();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const duration = Date.now() - startTime;
    logger.info({ uptime, duration }, "Healthcheck realizado com sucesso");
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
    logError(error, { duration }, "Falha no healthcheck");
    return reply.status(500).send({ status: "error", message: HEALTH_CHECK_CONSTANTS.INTERNAL_ERROR });
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
    const formSubmission2 = formSubmissionResult.value;
    const sanitizedFormSubmission = {
      name: formSubmission2.name,
      lastName: formSubmission2.lastName,
      email: formSubmission2.email,
      decisaoPorCristo: formSubmission2.decisaoPorCristo,
      location: formSubmission2.location ?? null,
      ipAddress: formSubmission2.ipAddress ?? null
    };
    const outboxEvent = await this.eventRegistration.register(sanitizedFormSubmission);
    if (isErr(outboxEvent)) {
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
    super(FORM_ERRORS.SUBMISSION, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/repositories/prisma/errors/forms-error-mapping.ts
var formsPrismaErrorMapping = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError()
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
    publisher.on("connect", () => logger.info(OUTBOX_LOGS.PUBLISHER_CONNECTED));
    publisher.on("error", (err2) => logger.error({ err: err2 }, OUTBOX_LOGS.PUBLISHER_ERROR));
    publisher.on("close", () => logger.warn(OUTBOX_LOGS.PUBLISHER_CLOSED));
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

// src/http/controllers/forms/form.controller.ts
async function formSubmission(request, reply) {
  const data = formsSchema.parse(request.body);
  const formSubmissionUseCase = makeFormSubmissionUseCase();
  const result = await formSubmissionUseCase.execute({
    ...data,
    ipAddress: request.ip
  });
  if (isErr(result)) {
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
  message: VALIDATION_CONSTANTS.CEP.INVALID_FORMAT
});

// src/lib/redis/connections/redis-bullMQ-connection.ts
var import_ioredis2 = __toESM(require("ioredis"));

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

// src/lib/redis/connections/redis-cache-connection.ts
var import_ioredis3 = __toESM(require("ioredis"));
function createRedisCacheConnection() {
  const redis = new import_ioredis3.default({
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
    connectTimeout: 2e3,
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
      REDIS_LOGS.RATE_LIMITER_UNEXPECTED_ERROR
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
  await Promise.allSettled(
    targets.map((connection) => connection.status !== "end" ? connection.quit() : Promise.resolve())
  );
  redisCacheInstance = null;
  redisRateLimitInstance = null;
  redisForQueueInstance = null;
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
    super(CHURCH_ERRORS.COORDINATES_NOT_FOUND, "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/invalid-cep-error.ts
var InvalidCepError = class extends DomainError {
  constructor(cep) {
    super(INVALID_CEP_ERROR_FN(cep), "NOT_FOUND" /* NOT_FOUND */, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/cep-to-lat-lon-error.ts
var CepToLatLonError = class extends DomainError {
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

// src/lib/infra/cache/resilient-cache.ts
var import_crypto2 = __toESM(require("crypto"));

// src/messages/constants/logs/cache.ts
var CACHE_LOGS = {
  READ_ERROR: "Erro de leitura ou falha do Redis. Continuando sem cache.",
  WRITE_ERROR: "Falha ao escrever no Redis (n\xE3o fatal, continuando)",
  CORRUPTED_ENVELOPE: "Cache corrompida detectada: CacheEnvelope de sucesso sem valor",
  TTL_SKIP: "TTL <= 0, pulando escrita no cache"
};

// src/errors/infrastructure/service-overload-error.ts
var ServiceOverloadError = class extends InfrastructureError {
  constructor() {
    super(INFRA_ERRORS.SERVICE_OVERLOAD, void 0, "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */);
    this.name = "ServiceOverloadError";
  }
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

// src/errors/infrastructure/timeout-exceeded-error.ts
var TimeoutExceededError = class extends InfrastructureError {
  constructor(reason) {
    super(GEO_ERRORS.TIMEOUT_EXCEEDED, reason, "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */, "RETRYABLE" /* RETRYABLE */);
    this.name = "TimeoutExceededError";
  }
};

// src/errors/infrastructure/provider-failure-error.ts
var ProviderFailureError = class extends InfrastructureError {
  constructor(provider, layer, originalError) {
    super(
      {
        code: INFRA_ERRORS.PROVIDER_FAILURE.code,
        message: INFRA_ERRORS.PROVIDER_FAILURE.message,
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
      return err(new ServiceOverloadError());
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
            logger.error({ key, envelope }, CACHE_LOGS.CORRUPTED_ENVELOPE);
            return err(
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
              return err(deserialized);
            }
          }
          return err(
            new ProviderFailureError(
              "Cache",
              "AddressProvider" /* Address */,
              new Error(`Cached Error: ${envelope.e.type} - ${envelope.e.message}`)
            )
          );
        }
      }
    } catch (err2) {
      logger.warn({ err: err2, key }, CACHE_LOGS.READ_ERROR);
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
      return err(new TimeoutExceededError(effectiveSignal.reason || "Timeout Exceeded"));
    }
    let timeoutId;
    let abortListener;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutExceededError("Timeout Exceeded"));
      }, this.FETCH_TIMEOUT);
      abortListener = () => {
        reject(new TimeoutExceededError(effectiveSignal.reason || "Timeout Exceeded"));
      };
      effectiveSignal.addEventListener("abort", abortListener, { once: true });
    });
    try {
      const fetchPromise = fetcher(effectiveSignal);
      const result = await Promise.race([fetchPromise, timeoutPromise]);
      if (effectiveSignal.aborted) {
        return err(new TimeoutExceededError(effectiveSignal.reason || "Timeout Exceeded"));
      }
      if (isErr(result)) {
        const error = result.error;
        const isRetryableFn = this.options.isRetryable ?? ((errVal) => errVal?.failureMode === "RETRYABLE");
        if (!isRetryableFn(error)) {
          const serializer = this.options.serializeError ?? ((errVal) => ({
            type: errVal.constructor?.name || "Error",
            message: errVal.message || String(errVal),
            data: errVal
          }));
          await this.setResult(key, {
            s: false,
            e: serializer(error)
          });
        }
        return err(error);
      }
      await this.setResult(key, { s: true, v: result.value });
      return ok(result.value);
    } catch (error) {
      if (effectiveSignal.aborted || error instanceof TimeoutExceededError) {
        const abortReason = parentSignal?.aborted ? parentSignal.reason : "Timeout Exceeded";
        return err(new TimeoutExceededError(abortReason));
      }
      return err(new ProviderFailureError("Fetcher", "AddressProvider" /* Address */, error));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (abortListener) effectiveSignal.removeEventListener("abort", abortListener);
    }
  }
  async setResult(key, envelope) {
    const baseTtl = !envelope.s ? this.options.negativeTtlSeconds : this.options.defaultTtlSeconds;
    if (baseTtl <= 0) {
      logger.debug({ key }, CACHE_LOGS.TTL_SKIP);
      return;
    }
    try {
      const jitterAmount = Math.floor(baseTtl * this.JITTER_PERCENTAGE);
      const randomOffset = Math.floor(Math.random() * (jitterAmount * 2 + 1)) - jitterAmount;
      const finalTtl = Math.max(1, baseTtl + randomOffset);
      await this.redis.set(key, JSON.stringify(envelope), "EX", finalTtl);
    } catch (err2) {
      logger.warn({ err: err2, key }, CACHE_LOGS.WRITE_ERROR);
    }
  }
};

// src/messages/constants/churches/churches.ts
var CHURCH_CONSTANTS = {
  KNN_LIMIT: 5,
  GEOCODING_COUNTRY: "Brazil",
  UNKNOWN_PROVIDER: "Unknown"
};

// src/use-cases/churches/cep-to-lat-lon-use-case.ts
var CepToLatLonUseCase = class {
  constructor(geocodingProvider, addressProvider, redis, optionsOverride, cacheSuccessResults = true) {
    this.geocodingProvider = geocodingProvider;
    this.addressProvider = addressProvider;
    this.redis = redis;
    this.cacheSuccessResults = cacheSuccessResults;
    this.cacheManager = new ResilientCache(redis, optionsOverride);
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
      return err(addrResult.error);
    }
    const data = addrResult.value;
    if (!data) {
      return err(new InvalidCepError());
    }
    if (data.lat && data.lon) {
      return ok({
        userLat: data.lat,
        userLon: data.lon,
        precision: data.precision ?? "NO_CERTAINTY" /* NO_CERTAINTY */,
        coordinatesProviderName: data.providerName ?? CHURCH_CONSTANTS.UNKNOWN_PROVIDER
      });
    }
    const address = data;
    const { logradouro, localidade, uf, bairro } = address;
    if (logradouro) {
      const exactResult = await this.geocodingProvider.search(
        `${logradouro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
        signal
      );
      if (isOk(exactResult) && exactResult.value) {
        return ok(this.mapResponse(exactResult.value));
      }
      if (isErr(exactResult) && exactResult.error.failureMode !== "NOT_FOUND" /* NOT_FOUND */) {
        return err(exactResult.error);
      }
    }
    if (bairro) {
      const approxResult = await this.geocodingProvider.search(
        `${bairro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
        signal
      );
      if (isOk(approxResult) && approxResult.value) {
        return ok(this.mapResponse(approxResult.value));
      }
      if (isErr(approxResult) && approxResult.error.failureMode !== "NOT_FOUND" /* NOT_FOUND */) {
        return err(approxResult.error);
      }
    }
    if (localidade) {
      const cityResult = await this.geocodingProvider.searchStructured(
        {
          city: localidade,
          state: uf,
          country: CHURCH_CONSTANTS.GEOCODING_COUNTRY
        },
        signal
      );
      if (isOk(cityResult)) {
        if (cityResult.value === null) {
          return err(new CoordinatesNotFoundError());
        }
        return ok(this.mapResponse(cityResult.value));
      } else {
        return err(cityResult.error);
      }
    }
    logger.error({ cep: cleanCep, city: localidade }, "Cr\xEDtico: Geocoding Provider n\xE3o encontrou a cidade.");
    return err(new CepToLatLonError(cleanCep));
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
    super(CHURCH_ERRORS.EMPTY_LIST, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/errors/no-nearby-churches-found-error.ts
var NoNearbyChurchesFoundError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_NEARBY_FOUND, "NOT_FOUND" /* NOT_FOUND */);
  }
};

// src/use-cases/churches/calculate-church-route-distances-use-case.ts
var CalculateChurchRouteDistancesUseCase = class {
  constructor(routingProvider) {
    this.routingProvider = routingProvider;
  }
  async findNearest({ churches, user, signal }, profile) {
    if (!churches.length) {
      return err(new EmptyChurchListError());
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
      return err(new NoNearbyChurchesFoundError());
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
    this.cacheManager = new ResilientCache(redis, optionsOverride);
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
        return err(cepResult.error);
      }
      const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value;
      const knnResult = await this.findNearbyChurchesKnnUseCase.execute({
        userLat,
        userLon
      });
      if (isErr(knnResult)) {
        return err(knnResult.error);
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
        return err(nearestChurchesResult.error);
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
    super(CHURCH_ERRORS.LATITUDE_OUT_OF_RANGE, "BAD_REQUEST" /* BAD_REQUEST */);
  }
};

// src/use-cases/errors/longitude-range-error.ts
var LongitudeRangeError = class extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.LONGITUDE_OUT_OF_RANGE, "BAD_REQUEST" /* BAD_REQUEST */);
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
      return err(new LatitudeRangeError());
    }
    if (userLon < -180 || userLon > 180) {
      return err(new LongitudeRangeError());
    }
    const result = await this.churchesRepository.findNearest({
      userLat,
      userLon,
      limit: CHURCH_CONSTANTS.KNN_LIMIT
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
      return err(this.errorMapper.mapToKnownError(error));
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
      const church = rows[0];
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

// src/providers/address-provider/error/no-address-provider-error.ts
var NoAddressProviderError = class extends InfrastructureError {
  constructor() {
    super(GEO_ERRORS.NO_ADDRESS_PROVIDER);
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
        return err(new TimeoutExceededError(effectiveSignal.reason));
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
      return err(error);
    }
    if (notFoundCount === this.providers.length) {
      logger.warn(
        { cep: cleanCep, notFoundCount, totalProviders: this.providers.length },
        "TODOS os provedores confirmaram CEP inv\xE1lido/n\xE3o encontrado"
      );
      return err(new InvalidCepError());
    }
    if (lastRetryableError) {
      logger.error(
        { cep: cleanCep, provider: lastProviderName, notFoundCount },
        "Provedores de endere\xE7o falharam com erros de sistema"
      );
      return err(lastRetryableError);
    }
    return err(
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
  timeout: 3e4,
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

// src/messages/constants/logs/rate-limiter.ts
var RATE_LIMITER_LOGS = {
  INFRA_DEGRADED: "RedisRateLimiter com erro: Redis n\xE3o dispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open).",
  INFRA_STILL_DEGRADED: "RedisRateLimiter continua degradado: Redis indispon\xEDvel, permitindo requisi\xE7\xF5es (fail-open).",
  INFRA_RECOVERED: "RedisRateLimiter restabelecido: Redis dispon\xEDvel novamente.",
  TOO_MANY_LIMITERS: "ALERTA: Muitos RateLimiters instanciados. Verifique se providers est\xE3o est\xE1ticos.",
  NO_INSTANCE_TO_DESTROY: "Nenhuma inst\xE2ncia de RedisRateLimiter para destruir."
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
    const config = this.providerConfigs[provider] || { points: 10, windowSeconds: 1 };
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
        RATE_LIMITER_LOGS.INFRA_DEGRADED
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
        RATE_LIMITER_LOGS.INFRA_STILL_DEGRADED
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
      RATE_LIMITER_LOGS.INFRA_RECOVERED
    );
    this.infraOutageStartedAt = null;
    this.infraLastWarnAt = 0;
    this.infraSuppressedLogs = 0;
  }
  static async destroyInstance() {
    if (!this.instance) {
      logger.debug(RATE_LIMITER_LOGS.NO_INSTANCE_TO_DESTROY);
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
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: AWESOME_API_CONFIG.TIMEOUT_MS,
      headers: {
        "User-Agent": SHARED_PROVIDER_DEFAULTS.USER_AGENT
      },
      agentOptions: {
        keepAliveMsecs: AWESOME_API_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: AWESOME_API_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: AWESOME_API_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: AWESOME_API_CONFIG.HTTPS_AGENT.TIMEOUT_MS
      }
    });
  }
  api;
  providerName = "AwesomeAPI";
  rateLimitConfig = "awesomeApiAddressProvider" /* AWESOME_API_ADDRESS */;
  maxRetries = AWESOME_API_CONFIG.MAX_RETRIES;
  backoffMs = AWESOME_API_CONFIG.BACKOFF_MS;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await this.api.get(`/${cleanCep}`, {
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
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: BRASIL_API_CONFIG.TIMEOUT_MS,
      headers: {
        "User-Agent": SHARED_PROVIDER_DEFAULTS.USER_AGENT
      },
      agentOptions: {
        keepAliveMsecs: BRASIL_API_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: BRASIL_API_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: BRASIL_API_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: BRASIL_API_CONFIG.HTTPS_AGENT.TIMEOUT_MS
      }
    });
  }
  api;
  providerName = "BrasilAPI";
  rateLimitConfig = "brasilApiAddressProvider" /* BRASIL_API_ADDRESS */;
  maxRetries = BRASIL_API_CONFIG.MAX_RETRIES;
  backoffMs = BRASIL_API_CONFIG.BACKOFF_MS;
  async fetchRawAddress(cep, signal) {
    const cleanCep = cep.replace(/\D/g, "");
    const { data } = await this.api.get(`/${cleanCep}`, {
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
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: VIACEP_CONFIG.TIMEOUT_MS,
      headers: {
        "User-Agent": SHARED_PROVIDER_DEFAULTS.USER_AGENT
      },
      agentOptions: {
        keepAliveMsecs: VIACEP_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: VIACEP_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: VIACEP_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: VIACEP_CONFIG.HTTPS_AGENT.TIMEOUT_MS
      }
    });
  }
  api;
  providerName = "ViaCEP";
  rateLimitConfig = "viacepAddressProvider" /* VIACEP_ADDRESS */;
  maxRetries = VIACEP_CONFIG.MAX_RETRIES;
  backoffMs = VIACEP_CONFIG.BACKOFF_MS;
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
      precision,
      providerName: "ViaCEP"
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
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: NOMINATIM_CONFIG.TIMEOUT_MS,
      headers: {
        "User-Agent": SHARED_PROVIDER_DEFAULTS.USER_AGENT_WITH_CONTACT
      },
      agentOptions: {
        keepAliveMsecs: NOMINATIM_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: NOMINATIM_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: NOMINATIM_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: NOMINATIM_CONFIG.HTTPS_AGENT.TIMEOUT_MS
      }
    });
  }
  api;
  providerName = "Nominatim";
  rateLimitConfig = "nominatimGeocodingProvider" /* NOMINATIM_GEOCODING */;
  maxRetries = NOMINATIM_CONFIG.MAX_RETRIES;
  backoffMs = NOMINATIM_CONFIG.BACKOFF_MS;
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
    this.api = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: LOCATION_IQ_CONFIG.TIMEOUT_MS,
      params: {
        key: this.config.apiToken,
        format: LOCATION_IQ_CONFIG.API_PARAMS.FORMAT
      },
      agentOptions: {
        keepAliveMsecs: LOCATION_IQ_CONFIG.HTTPS_AGENT.KEEP_ALIVE_MSECS,
        maxSockets: LOCATION_IQ_CONFIG.HTTPS_AGENT.MAX_SOCKETS,
        maxFreeSockets: LOCATION_IQ_CONFIG.HTTPS_AGENT.MAX_FREE_SOCKETS,
        timeout: LOCATION_IQ_CONFIG.HTTPS_AGENT.TIMEOUT_MS
      }
    });
  }
  api;
  providerName = "LocationIQ";
  rateLimitConfig = "locationIqGeocodingProvider" /* LOCATION_IQ_GEOCODING */;
  maxRetries = LOCATION_IQ_CONFIG.MAX_RETRIES;
  backoffMs = LOCATION_IQ_CONFIG.BACKOFF_MS;
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
      lat: parseFloat(bestMatch.lat),
      lon: parseFloat(bestMatch.lon),
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
        return err(new TimeoutExceededError(signal.reason));
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
      return err(error);
    }
    if (notFoundCount === this.providers.length) {
      logger.warn(
        { notFoundCount, totalProviders: this.providers.length },
        "Nenhum provedor retornou resultados - coordenadas n\xE3o encontradas"
      );
      return err(new CoordinatesNotFoundError());
    }
    if (lastRetryableError) {
      logger.error({ provider: lastProviderName }, "Geocodifica\xE7\xE3o falhou com erros de sistema");
      return err(lastRetryableError);
    }
    return err(
      new ProviderFailureError("ResilientGeoProvider", "GeoProvider" /* Geo */, new Error("TODOS os provedores falharam"))
    );
  }
};

// src/messages/constants/providers/stadia.ts
var STADIA_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3e3,
  AUTH_PREFIX: "Stadia-Auth",
  UNITS: "kilometers",
  CONTENT_TYPE: "application/json"
};

// src/providers/church-routing-provider/stadia-church-routing-provider.ts
var StadiaChurchRoutingProvider = class {
  constructor(config) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? STADIA_CONFIG.DEFAULT_TIMEOUT_MS;
    this.defaultCosting = config.defaultCosting;
    this.api = createHttpClient({
      timeout: this.timeoutMs
    });
  }
  api;
  providerName = "Stadia Maps";
  rateLimitConfig = "stadiaRoutingProvider" /* STADIA_ROUTING */;
  timeoutMs;
  defaultCosting;
  async fetchRawDistance(origin, destination, profile, signal) {
    const costing = profile ?? this.config.defaultCosting ?? "auto" /* AUTO */;
    const response = await this.api.post(
      this.config.apiUrl.replace(/\/$/, ""),
      {
        locations: [
          { lat: origin.lat, lon: origin.lon },
          { lat: destination.lat, lon: destination.lon }
        ],
        costing,
        directions_options: {
          units: STADIA_CONFIG.UNITS
        }
      },
      {
        headers: {
          Authorization: `${STADIA_CONFIG.AUTH_PREFIX} ${this.config.apiToken}`,
          "Content-Type": STADIA_CONFIG.CONTENT_TYPE
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
  async fetchRawDistances(origin, destinations, profile, signal) {
    const costing = profile ?? this.config.defaultCosting ?? "auto" /* AUTO */;
    const response = await this.api.post(
      this.config.matrixApiUrl.replace(/\/$/, ""),
      {
        sources: [{ lat: origin.lat, lon: origin.lon }],
        targets: destinations.map((d) => ({ lat: d.lat, lon: d.lon })),
        costing,
        units: STADIA_CONFIG.UNITS
      },
      {
        headers: {
          Authorization: `${STADIA_CONFIG.AUTH_PREFIX} ${this.config.apiToken}`,
          "Content-Type": STADIA_CONFIG.CONTENT_TYPE
        },
        signal,
        validateStatus: (status) => status >= 200 && status < 300 || status === 404
      }
    );
    if (response.status === 404 || !response.data?.sources_to_targets?.length) {
      return destinations.map(() => ({ distance: null, status: 404 }));
    }
    const row = response.data.sources_to_targets[0];
    return destinations.map((_, index) => {
      const entry = row?.[index];
      if (!entry || entry.distance == null) {
        return { distance: null, status: 0 };
      }
      return { distance: entry.distance, status: 0 };
    });
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
var import_client5 = require("@prisma/client");

// src/errors/infrastructure/service-busy-error.ts
var ServiceBusyError = class extends InfrastructureError {
  provider;
  constructor(provider) {
    super(INFRA_ERRORS.SERVICE_BUSY, void 0, "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */, "RETRYABLE" /* RETRYABLE */);
    this.name = "ServiceBusyError";
    this.provider = provider;
  }
};

// src/errors/mappings/find-nearest-churches-error-mapper.ts
var FindNearestChurchesErrorMapper = class _FindNearestChurchesErrorMapper {
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
    if (error instanceof import_client5.Prisma.PrismaClientKnownRequestError || error instanceof import_client5.Prisma.PrismaClientUnknownRequestError) {
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
      return err(new ServiceBusyError(this.rawProvider.providerName));
    }
    for (let attempt = 1; attempt <= this.rawProvider.maxRetries; attempt++) {
      if (signal?.aborted) {
        return err(new TimeoutExceededError(signal.reason));
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
          return err(appError);
        }
        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({ cep: cleanCep, attempt, delay }, `Repetindo solicita\xE7\xE3o para ${this.rawProvider.providerName}`);
        await this.sleep(delay, signal);
      }
    }
    logger.error({ cep: cleanCep }, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`);
    return err(new ServiceBusyError(this.rawProvider.providerName));
  }
  sleep(ms2, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        return resolve();
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms2);
      function onAbort() {
        clearTimeout(timer);
        resolve();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
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
      return err(new ServiceBusyError(this.rawProvider.providerName));
    }
    for (let attempt = 1; attempt <= this.rawProvider.maxRetries; attempt++) {
      if (signal?.aborted) {
        return err(new TimeoutExceededError(signal.reason));
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
          return err(appError);
        }
        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({ ...logContext, attempt, delay }, `Repetindo solicita\xE7\xE3o para ${this.rawProvider.providerName}`);
        await this.sleep(delay, signal);
      }
    }
    logger.error(logContext, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`);
    return err(new ServiceBusyError(this.rawProvider.providerName));
  }
  sleep(ms2, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        return resolve();
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms2);
      function onAbort() {
        clearTimeout(timer);
        resolve();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
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
  providerName;
  async getDistances(params) {
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection);
    const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig);
    if (!allowed) {
      return err(new ServiceBusyError(this.rawProvider.providerName));
    }
    if (params.signal?.aborted) {
      return err(new TimeoutExceededError(params.signal.reason));
    }
    try {
      const costing = params.profile ?? this.rawProvider.defaultCosting ?? "auto" /* AUTO */;
      const results = await this.rawProvider.fetchRawDistances(
        params.origin,
        params.destinations,
        costing,
        params.signal
      );
      return ok(results);
    } catch (error) {
      return err(FindNearestChurchesErrorMapper.map(error));
    }
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
var UnknownDeserializationError = class extends InfrastructureError {
  constructor(message) {
    super({
      code: "UNKNOWN_DESERIALIZATION_ERROR",
      message
    });
  }
};
function deserializeAppError(type, message, data) {
  const factory = AppErrorRegistry[type];
  if (factory) {
    try {
      return factory(message, data);
    } catch {
    }
  }
  return new UnknownDeserializationError(message);
}

// src/messages/constants/cache/cache.ts
var CACHE_CONFIG = {
  CEP_COORDS: {
    PREFIX: "cache:cep-coords:",
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7,
    // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30,
    // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 1e4
  },
  NEAREST_CHURCHES: {
    PREFIX: "cache:nearest-churches:",
    DEFAULT_TTL_SECONDS: 60 * 60 * 24 * 7,
    // 7 days
    NEGATIVE_TTL_SECONDS: 60 * 30,
    // 30 min
    MAX_PENDING_FETCHES: 500,
    FETCH_TIMEOUT_MS: 15e3
  }
};

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
      prefix: CACHE_CONFIG.CEP_COORDS.PREFIX,
      defaultTtlSeconds: CACHE_CONFIG.CEP_COORDS.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: CACHE_CONFIG.CEP_COORDS.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: CACHE_CONFIG.CEP_COORDS.MAX_PENDING_FETCHES,
      fetchTimeoutMs: CACHE_CONFIG.CEP_COORDS.FETCH_TIMEOUT_MS,
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
    matrixApiUrl: env.STADIA_MAPS_MATRIX_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: "pedestrian" /* PEDESTRIAN */,
    timeoutMs: STADIA_CONFIG.DEFAULT_TIMEOUT_MS
  });
  const routingProvider = new ResilientChurchRoutingProviderDecorator(rawRoutingProvider, redisRateLimitConnection);
  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(routingProvider);
  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    calculateChurchRouteDistancesUseCase,
    redisCacheConnection,
    {
      prefix: CACHE_CONFIG.NEAREST_CHURCHES.PREFIX,
      defaultTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: CACHE_CONFIG.NEAREST_CHURCHES.MAX_PENDING_FETCHES,
      fetchTimeoutMs: CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS,
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
    return HttpErrorMapper.map(result.error, reply);
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
    super(CHURCH_ERRORS.NO_ADDRESS_PROVIDED, "BAD_REQUEST" /* BAD_REQUEST */);
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
      return err(new NoAddressError());
    }
    const nameResult = await this.churchesRepository.findByName(name);
    if (isErr(nameResult)) {
      return nameResult;
    }
    if (nameResult.value !== null) {
      return err(new ChurchAlreadyExistsError());
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
      return err(new ChurchAlreadyExistsError());
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
var import_client6 = require("@prisma/client");

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
  app2.post("/create", { onRequest: [verifyJwt, verifyUserRole([import_client6.UserRole.ADMIN])] }, createChurch);
  app2.delete("/delete", { onRequest: [verifyJwt, verifyUserRole([import_client6.UserRole.ADMIN])] }, deleteChurch);
}

// src/http/schemas/analytics/track-event-schema.ts
var import_zod18 = require("zod");
var trackEventSchema = import_zod18.z.object({
  eventType: import_zod18.z.string().min(1),
  path: import_zod18.z.string().min(1),
  payload: import_zod18.z.record(import_zod18.z.string(), import_zod18.z.any()).optional()
});

// src/repositories/prisma/prisma-analytics-repository.ts
var PrismaAnalyticsRepository = class {
  async upsertSession(data) {
    try {
      const session = await prisma.analyticsSession.upsert({
        where: { sessionId: data.sessionId },
        update: {
          visitorId: data.visitorId,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmTerm: data.utmTerm ?? null,
          utmContent: data.utmContent ?? null
        },
        create: {
          visitorId: data.visitorId,
          sessionId: data.sessionId,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmTerm: data.utmTerm ?? null,
          utmContent: data.utmContent ?? null
        }
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
      const session = await prisma.analyticsSession.findUnique({
        where: { sessionId }
      });
      return ok(session);
    } catch (error) {
      return err(new DatabaseQueryError(error));
    }
  }
};

// src/use-cases/analytics/track-analytics.ts
var TrackAnalyticsUseCase = class {
  constructor(analyticsRepository) {
    this.analyticsRepository = analyticsRepository;
  }
  async execute(request) {
    const sessionResult = await this.analyticsRepository.upsertSession({
      visitorId: request.visitorId,
      sessionId: request.sessionId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      utmSource: request.utmSource,
      utmMedium: request.utmMedium,
      utmCampaign: request.utmCampaign,
      utmTerm: request.utmTerm,
      utmContent: request.utmContent
    });
    if (isErr(sessionResult)) {
      return sessionResult;
    }
    const eventResult = await this.analyticsRepository.createEvent({
      sessionId: request.sessionId,
      eventType: request.eventType,
      path: request.path,
      payload: request.payload
    });
    if (isErr(eventResult)) {
      return eventResult;
    }
    return ok(void 0);
  }
};

// src/use-cases/factories/make-track-analytics-use-case.ts
function makeTrackAnalyticsUseCase() {
  const analyticsRepository = new PrismaAnalyticsRepository();
  const trackAnalyticsUseCase = new TrackAnalyticsUseCase(analyticsRepository);
  return trackAnalyticsUseCase;
}

// src/http/controllers/analytics/track-event.controller.ts
async function trackEvent(request, reply) {
  const { eventType, path, payload } = trackEventSchema.parse(request.body);
  const xff = request.headers["x-forwarded-for"];
  const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(",")[0].trim() || request.ip;
  const query = request.query;
  const trackAnalyticsUseCase = makeTrackAnalyticsUseCase();
  const result = await trackAnalyticsUseCase.execute({
    visitorId: request.visitorId,
    sessionId: request.sessionId,
    eventType,
    path,
    ipAddress: clientIp,
    userAgent: request.headers["user-agent"] || null,
    utmSource: query?.["utm_source"] || null,
    utmMedium: query?.["utm_medium"] || null,
    utmCampaign: query?.["utm_campaign"] || null,
    utmTerm: query?.["utm_term"] || null,
    utmContent: query?.["utm_content"] || null,
    payload
  });
  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply);
  }
  return reply.status(201).send();
}

// src/http/controllers/analytics/analytics.routes.ts
async function analyticsRoutes(app2) {
  app2.post("/events", trackEvent);
}

// src/http/routes.ts
async function appRoutes(app2) {
  app2.register(usersRoutes, { prefix: "/users" });
  app2.register(healthCheckRoutes, { prefix: "/health" });
  app2.register(formsRoutes, { prefix: "/forms" });
  app2.register(churchesRoutes, { prefix: "/churches" });
  app2.register(analyticsRoutes, { prefix: "/analytics" });
}

// src/app.ts
var import_uuid = require("uuid");
var import_zod20 = __toESM(require("zod"));
var import_jwt = __toESM(require("@fastify/jwt"));
var import_cors = __toESM(require("@fastify/cors"));
var import_cookie2 = __toESM(require("@fastify/cookie"));

// src/http/plugins/async-context.plugin.ts
var import_fastify_plugin = __toESM(require_plugin());
var asyncContextPlugin = async (app2) => {
  app2.addHook("onRequest", (request, reply, done) => {
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
var asyncContext = (0, import_fastify_plugin.default)(asyncContextPlugin, {
  name: "async-context"
});

// src/http/plugins/rate-limit.plugin.ts
var import_rate_limit5 = __toESM(require("@fastify/rate-limit"));
var import_fastify_plugin2 = __toESM(require_plugin());
var httpRateLimitPlugin = async (app2) => {
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
  await app2.register(import_rate_limit5.default, {
    global: true,
    max: HTTP_RATE_LIMIT_POLICIES.global.max,
    timeWindow: HTTP_RATE_LIMIT_POLICIES.global.timeWindow,
    hook: "onRequest",
    keyGenerator: (request) => request.ip,
    redis: getRedisRateLimit(),
    skipOnError: false
  });
};
var httpRateLimit = (0, import_fastify_plugin2.default)(httpRateLimitPlugin, {
  name: "http-rate-limit"
});

// src/http/plugins/error-handler.plugin.ts
var import_fastify_plugin3 = __toESM(require_plugin());
var import_zod19 = __toESM(require("zod"));
var Sentry2 = __toESM(require("@sentry/node"));

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
  Sentry2.withScope((scope) => {
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
    Sentry2.captureException(error);
  });
}
var errorHandlerPlugin = async (app2) => {
  app2.setErrorHandler((error, request, reply) => {
    if (error instanceof import_zod19.ZodError) {
      const zodValidationError = new ZodValidationError(import_zod19.default.treeifyError(error));
      const httpCode = toHttpStatus(zodValidationError.type);
      logger.debug(import_zod19.default.treeifyError(error), "Ocorreu um erro de valida\xE7\xE3o");
      return reply.status(httpCode).send({
        message: zodValidationError.body.message,
        code: zodValidationError.body.code,
        issues: zodValidationError.body.issues
      });
    }
    if (error instanceof SyntaxError) {
      logger.error(error, "JSON inv\xE1lido recebido");
      return reply.status(400).send({
        message: HTTP_ERRORS.INVALID_JSON.message,
        code: HTTP_ERRORS.INVALID_JSON.code
      });
    }
    if (error instanceof DomainError) {
      const httpCode = toHttpStatus(error.type);
      return reply.status(httpCode).send({
        message: error.body.message,
        code: error.body.code,
        issues: error.body.issues
      });
    }
    if (error instanceof AppError) {
      const httpCode = toHttpStatus(error.type);
      const isServiceUnavailable = error.type === "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */ || error.type === "TOO_MANY_REQUESTS" /* TOO_MANY_REQUESTS */;
      logger.error({ err: error, cause: error.cause }, "Ocorreu um erro de infraestrutura/sistema");
      captureWithRequestContext(error, request);
      return reply.status(httpCode).send({
        message: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.message : HTTP_ERRORS.INTERNAL_SERVER.message,
        code: isServiceUnavailable ? HTTP_ERRORS.SERVICE_UNAVAILABLE.code : HTTP_ERRORS.INTERNAL_SERVER.code
      });
    }
    if (error.statusCode) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    logger.error(error, "Ocorreu um erro n\xE3o tratado");
    captureWithRequestContext(error, request);
    reply.status(500).send({
      message: HTTP_ERRORS.INTERNAL_SERVER.message,
      code: HTTP_ERRORS.INTERNAL_SERVER.code
    });
  });
};
var errorHandler = (0, import_fastify_plugin3.default)(errorHandlerPlugin, {
  name: "error-handler"
});

// src/http/plugins/request-lifecycle.plugin.ts
var import_fastify_plugin4 = __toESM(require_plugin());
var requestLifecyclePlugin = async (app2) => {
  app2.addHook("onRequest", async (request) => {
    const xff = request.headers["x-forwarded-for"];
    const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(",")[0].trim() || request.ip;
    try {
      const decoded = await request.jwtVerify();
      setUserId(decoded.sub);
    } catch {
    }
    logger.info(
      {
        method: request.method,
        url: request.url,
        ip: clientIp,
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
var requestLifecycle = (0, import_fastify_plugin4.default)(requestLifecyclePlugin, {
  name: "request-lifecycle",
  dependencies: ["async-context"]
});

// src/http/plugins/memory-monitor.plugin.ts
var import_fastify_plugin5 = __toESM(require_plugin());
var MEMORY_CHECK_INTERVAL_MS = 6e4;
var HEAP_WARNING_THRESHOLD_MB = 400;
var memoryMonitorPlugin = async (app2) => {
  if (env.NODE_ENV !== "production") {
    return;
  }
  let interval = null;
  app2.addHook("onReady", () => {
    interval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const rssMB = memUsage.rss / 1024 / 1024;
      if (heapUsedMB > HEAP_WARNING_THRESHOLD_MB) {
        logger.warn({
          msg: "Alto uso de mem\xF3ria detectado",
          heapUsedMB: Math.round(heapUsedMB),
          rssMB: Math.round(rssMB),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)
        });
      }
    }, MEMORY_CHECK_INTERVAL_MS);
  });
  app2.addHook("onClose", () => {
    if (interval) {
      clearInterval(interval);
      logger.info("Intervalo do monitor de mem\xF3ria finalizado");
    }
  });
};
var memoryMonitor = (0, import_fastify_plugin5.default)(memoryMonitorPlugin, {
  name: "memory-monitor"
});

// src/http/plugins/analytics.plugin.ts
var import_fastify_plugin6 = __toESM(require_plugin());
var import_cookie = require("@fastify/cookie");
var import_node_crypto = require("crypto");
var analyticsPlugin = async (app2) => {
  app2.addHook("onRequest", async (request, reply) => {
    try {
      let visitorId = null;
      const visitorCookie = request.cookies["visitor_id"];
      if (visitorCookie) {
        const unsigned = request.unsignCookie(visitorCookie);
        if (unsigned.valid && unsigned.value) {
          visitorId = unsigned.value;
        }
      }
      if (!visitorId) {
        visitorId = (0, import_node_crypto.randomUUID)();
        reply.setCookie("visitor_id", visitorId, {
          path: "/",
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
          signed: true,
          maxAge: 365 * 24 * 60 * 60
          // 1 year in seconds
        });
      }
      let sessionId = null;
      const sessionCookie = request.cookies["session_id"];
      if (sessionCookie) {
        const unsigned = request.unsignCookie(sessionCookie);
        if (unsigned.valid && unsigned.value) {
          sessionId = unsigned.value;
        }
      }
      if (!sessionId) {
        sessionId = (0, import_node_crypto.randomUUID)();
        reply.setCookie("session_id", sessionId, {
          path: "/",
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
          signed: true
          // session-scoped (expires when browser is closed)
        });
      }
      request.visitorId = visitorId;
      request.sessionId = sessionId;
    } catch (error) {
      logger.warn(error, "Erro n\xE3o cr\xEDtico ao extrair/definir cookies de analytics, prosseguindo com IDs tempor\xE1rios");
      request.visitorId = request.visitorId || (0, import_node_crypto.randomUUID)();
      request.sessionId = request.sessionId || (0, import_node_crypto.randomUUID)();
    }
  });
};
var analytics = (0, import_fastify_plugin6.default)(analyticsPlugin, {
  name: "analytics",
  dependencies: ["async-context"]
});

// src/app.ts
var import_fastify_metrics = __toESM(require("fastify-metrics"));
var import_prom_client3 = __toESM(require("prom-client"));

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

// src/app.ts
import_zod20.default.config(import_zod20.default.locales.pt());
var app = (0, import_fastify.default)({
  logger: false,
  trustProxy: true,
  genReqId: () => (0, import_uuid.v7)()
});
app.register(asyncContext);
var metricsRegistry = getRegistry();
if (metricsRegistry) {
  app.register(import_fastify_metrics.default, {
    promClient: import_prom_client3.default,
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
app.register(import_cookie2.default, {
  secret: env.COOKIE_SECRET
});
app.register(analytics);
app.register(import_jwt.default, {
  secret: env.JWT_SECRET
});
app.register(requestLifecycle);
app.register(memoryMonitor);
app.register(errorHandler);
app.register(appRoutes);
app.addHook("onClose", async () => {
  logger.info("Finalizando as conex\xF5es do RateLimiter e Redis...");
  try {
    await RedisRateLimiter.destroyInstance();
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
var Sentry3 = __toESM(require("@sentry/node"));
var isShuttingDown = false;
async function crashShutdown(error, cleanup) {
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
    await cleanup();
    logger.info("Limpeza de encerramento por travamento conclu\xEDda com sucesso.");
  } catch (cleanupError) {
    logger.error({ err: cleanupError }, "Ocorreu um erro durante a limpeza de encerramento por travamento");
  }
  try {
    if (error instanceof Error) {
      Sentry3.captureException(error);
    } else {
      Sentry3.captureException(new Error(String(error)));
    }
    await Sentry3.flush(2e3);
    logger.info("Logs do Sentry enviados com sucesso.");
  } catch (sentryError) {
    logger.error({ err: sentryError }, "Erro ao enviar os logs do Sentry durante o encerramento por travamento");
  } finally {
    clearTimeout(hardTimeout);
    process.exit(1);
  }
}

// src/metrics-server.ts
var import_fastify2 = __toESM(require("fastify"));
var import_prom_client4 = require("prom-client");
var metricsServer = null;
var registry2 = getRegistry();
var metricsCollectionErrors = registry2 ? new import_prom_client4.Counter({
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
  metricsServer = (0, import_fastify2.default)({ logger: false });
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

// src/server.ts
initSentry();
async function shutdown() {
  await app.close();
  await stopMetricsServer();
}
(0, import_close_with_grace.default)({ delay: 1e4 }, async ({ signal, err: err2 }) => {
  if (err2) {
    await crashShutdown(err2, shutdown);
  } else {
    logger.info({ signal }, `Sinal ${signal} recebido. Encerrando o servidor graciosamente...`);
    await shutdown();
    logger.info("Servidor encerrado graciosamente.");
    process.exit(0);
  }
});
process.on("unhandledRejection", (reason) => {
  crashShutdown(reason, shutdown);
});
process.on("uncaughtException", (error) => {
  crashShutdown(error, shutdown);
});
async function start() {
  try {
    await app.listen({ host: "0.0.0.0", port: env.APP_PORT });
    logger.info(`Servidor iniciado com sucesso! Escutando na porta: ${env.APP_PORT}`);
    try {
      await startMetricsServer({ port: env.METRICS_API_PORT });
    } catch (metricsErr) {
      logger.error({ err: metricsErr }, "Falha ao iniciar o servidor de m\xE9tricas; a API continuar\xE1 sem m\xE9tricas");
    }
  } catch (err2) {
    await crashShutdown(err2, shutdown);
  }
}
start();
