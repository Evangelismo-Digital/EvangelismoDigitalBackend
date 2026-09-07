import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import importPlugin from 'eslint-plugin-import'
import sonarjs from 'eslint-plugin-sonarjs'
import security from 'eslint-plugin-security'
import nodePlugin from 'eslint-plugin-n'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'logs',
      'reports',
      '.ci-local',
      '.stryker-tmp',
      'src/generated',
      'src/load-test/**',
      '**/*.spec.ts',
      '**/*.spec.mts',
      // Shared test scenarios reused by several specs — test code, so exempt
      // from the Layer 4 structural rules exactly as the specs themselves are.
      '**/*.contract.ts',
    ],
  },
  {
    files: ['src/**/*.{js,mjs,cjs,ts}', 'spec/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // projectService (not a static `project` path) so the type-aware rules
        // below — no-deprecated, no-floating-promises, no-unnecessary-condition
        // — resolve every file through the real TS program rather than a
        // second, drifting copy of the include list.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
    },
    settings: {
      // This tells ESLint how to find your files using TypeScript's logic
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
  },
  pluginJs.configs.recommended,
  // Type-aware, not just syntactic: the rules that matter most here (a promise
  // dropped on the floor, a call to a @deprecated symbol, a condition that can
  // never be false) are invisible without type information.
  ...tseslint.configs.strictTypeChecked,
  sonarjs.configs.recommended,
  security.configs.recommended,
  nodePlugin.configs['flat/recommended-module'],
  eslintConfigPrettier,
  {
    plugins: {
      prettier: eslintPluginPrettier,
    },
  },
  {
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-extraneous-class': 'off',
      semi: ['error', 'never'],

      // --- Import Tracking Rules ---
      'import/no-unresolved': 'error', // Errors if the file doesn't exist
      'import/no-duplicates': 'error', // Prevents double imports from same file
      'import/no-self-import': 'error', // Prevents a file from importing itself
      'import/no-useless-path-segments': 'error', // Cleans up ./../src/ logic
    },
  },
  {
    // --- Dead code ---
    // Knip covers whole unused files, exports and dependencies; these cover
    // what it cannot see — the unused local, the assignment nobody reads, the
    // branch whose condition the type system already decided.
    files: ['src/**/*.ts'],
    rules: {
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          // `_` prefix is the deliberate opt-out: an interface method that must
          // accept a parameter it does not use still has to declare it.
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-constant-condition': 'error',
      'no-useless-catch': 'error',
      'no-lone-blocks': 'error',
      // `sonarjs/todo-tag` is deliberately absent: comments in this repository
      // are written in Portuguese, where "todo" is the ordinary word for
      // "every" — it fires on prose like "em todo log de erro". SonarQube's own
      // S1135 implements the same check without that false positive and stays
      // active there, so real TODO tags are still caught.
      // `sonarjs/function-return-type` fires on a TypeScript overload's
      // implementation signature — the presenters declare four overloads each
      // and the implementation necessarily returns their union. The rule is
      // written for untyped JavaScript, where a function returning sometimes a
      // string and sometimes an object is a real hazard; here the overloads are
      // exactly what makes it safe.
      'sonarjs/function-return-type': 'off',
      'sonarjs/todo-tag': 'off',
      'sonarjs/no-dead-store': 'error',
      'sonarjs/no-unused-collection': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-ignored-return': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
    },
  },
  {
    // --- Deprecated code ---
    // Two different sources of truth: TypeScript's @deprecated JSDoc tag (any
    // library or our own code) and eslint-plugin-n's table of Node built-ins
    // deprecated by the runtime itself.
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
      'n/no-deprecated-api': 'error',
    },
  },
  {
    // --- Node.js / backend best practice ---
    files: ['src/**/*.ts'],
    rules: {
      // Async correctness. In a Fastify app an unawaited promise is a request
      // that returns before its work is done and an error nobody handles.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // Numbers in template literals are not a defect. `strictTypeChecked`
      // turns `allowNumber` off, which reports every `${port}`, `${attempt}`
      // and `${count}` in a log message — 20 of the 21 findings on this tree.
      // The values the rule exists to catch (an object stringifying to
      // "[object Object]", a possibly-undefined value printing as "undefined")
      // are still reported.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowAny: false, allowNullish: false, allowRegExp: false },
      ],
      // The defect this prevents is a promise RETURNED from a try block: it
      // settles after the catch has gone out of scope, so the catch never runs.
      // `error-handling-correctness-only` reports exactly that and stays silent
      // about a `return await` elsewhere — where there is no defect, only an
      // extra microtask boundary. Removing those 27 awaits would be a
      // behaviour-changing rewrite of working code, and this repo has already
      // lost single-flight deduplication once to a moved microtask boundary
      // (see CLAUDE.md), so churning boundaries to satisfy a style is a bad
      // trade.
      '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
      // `promise-function-async` is off for the same reason: it would rewrite
      // ~26 pass-through functions (`return this.prisma.user.findUnique(...)`)
      // into async wrappers, each adding a tick for no behavioural gain.
      '@typescript-eslint/promise-function-async': 'off',
      'require-atomic-updates': 'error',
      'n/no-sync': ['error', { allowAtRootLevel: false }],
      // A single-process API that calls process.exit skips Fastify's graceful
      // shutdown, dropping in-flight requests and BullMQ jobs.
      'n/no-process-exit': 'error',
      'n/prefer-node-protocol': 'error',
      'n/no-unsupported-features/node-builtins': 'error',
      'n/no-unsupported-features/es-builtins': 'error',
      // Resolution is import/no-unresolved's job (it understands the tsconfig
      // path aliases); eslint-plugin-n's resolver does not, and would report
      // every `@lib/...` import as missing.
      'n/no-missing-import': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-unpublished-import': 'off',
      // General correctness
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-return-assign': 'error',
      'no-throw-literal': 'off',
      '@typescript-eslint/only-throw-error': 'error',
      'prefer-promise-reject-errors': 'error',
      radix: 'error',
      'no-eval': 'error',
      'no-implied-eval': 'off',
      '@typescript-eslint/no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // --- Security ---
    // eslint-plugin-security's heuristics catch the classes SAST tools flag in
    // Node services: dynamic RegExp built from input (ReDoS), child_process
    // with a non-literal command, non-literal fs paths, unsafe buffer use.
    files: ['src/**/*.ts'],
    rules: {
      // `detect-object-injection` is deliberately absent. It flags every
      // computed member access, and on this tree it produced 30 findings of
      // which 28 were provably safe (`params[k]` over `Object.keys(params)`,
      // `logger[level]` over a string-literal union). The two that were real —
      // the error registry and the HTTP status table, both indexed by a string
      // that arrives from a deserialized payload — are fixed to use
      // prototype-safe lookups (see core/shared/safe-lookup.ts), which is a
      // better outcome than 28 permanent inline suppressions.
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-child-process': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-bidi-characters': 'error',
      'sonarjs/no-hardcoded-passwords': 'error',
      'sonarjs/no-hardcoded-secrets': 'error',
      'sonarjs/no-hardcoded-ip': 'error',
      'sonarjs/hashing': 'error',
      'sonarjs/no-weak-cipher': 'error',
      'sonarjs/no-weak-keys': 'error',
      'sonarjs/insecure-jwt-token': 'error',
      'sonarjs/publicly-writable-directories': 'error',
      'sonarjs/no-clear-text-protocols': 'error',
      'sonarjs/no-intrusive-permissions': 'error',
      'sonarjs/os-command': 'error',
      'sonarjs/sql-queries': 'error',
      'sonarjs/code-eval': 'error',
      'sonarjs/no-os-command-from-path': 'error',
    },
  },
  {
    // --- Layer 4: Structural & Complexity Gate ---
    // Errors, repo-wide. The legacy tree was brought into line in R5, so there is
    // no longer a backlog to keep green around — a new violation is a build
    // failure in `npm run lint`, ci:static and the PostToolUse hook alike.
    //
    // `sonarjs/cognitive-complexity` is the one SonarQube reports on its
    // dashboard, and it measures something `complexity` does not: nesting is
    // weighted, so three sequential guards score far below one triply-nested
    // branch even though both are cyclomatic 4. Both gates apply.
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      complexity: ['error', 6],
      'sonarjs/cognitive-complexity': ['error', 10],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 5],
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
    },
  },
  {
    // --- `require-await` exemption: contracts that dictate `async` ---
    //
    // A Fastify plugin or route function registered WITHOUT the `done` callback
    // must be async — Fastify waits on the returned promise, and a plain
    // function that returns undefined makes `register` hang forever. The
    // in-memory repositories implement interfaces whose methods return
    // `Promise<Result<...>>`; dropping `async` there would replace every return
    // with a `Promise.resolve(...)` wrapper, which is strictly worse to read.
    // In both cases the missing `await` is the contract, not an oversight.
    files: [
      'src/app.ts',
      'src/http/routes.ts',
      'src/http/**/*.routes.ts',
      'src/http/plugins/**/*.ts',
      'src/repositories/in-memory/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // --- `no-process-exit` exemption: the processes that own the exit code ---
    //
    // These three files ARE the shutdown path. crash-shutdown exists to turn an
    // unrecoverable state into a non-zero exit so the supervisor restarts the
    // process; server.ts and worker.ts call it after close-with-grace has
    // drained. Throwing instead, as the rule suggests, would land back in the
    // same crash handler.
    files: ['src/server.ts', 'src/worker.ts', 'src/lib/shutdown/**/*.ts'],
    rules: {
      'n/no-process-exit': 'off',
    },
  },
  {
    // --- Domain type alias ---
    // `LockToken = string` reads as redundant to `sonarjs/redundant-type-aliases`
    // and is not: it names the one string in `renew(key: string, token: LockToken)`
    // that is a proof of ownership rather than an identifier, across nine
    // signatures. The alternative the rule implies — `string` everywhere — is
    // the outcome this alias exists to prevent.
    files: ['src/lib/infra/distributed-lock/distributed-lock.ts'],
    rules: {
      'sonarjs/redundant-type-aliases': 'off',
    },
  },
  {
    // --- Layer 4 exemption: e-mail templates ---
    // These functions are a single HTML string literal with no branching, so
    // `max-lines-per-function` measures markup rather than logic. Splitting the
    // markup to satisfy a line count would make the templates harder to read,
    // not easier. `complexity` and `max-depth` still apply here.
    files: ['src/templates/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
]
