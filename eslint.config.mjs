import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import importPlugin from 'eslint-plugin-import'

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'logs',
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
      // Added parser options so the import plugin can read your tsconfig
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      import: importPlugin,
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
  ...tseslint.configs.strict,
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
      'import/no-duplicates': 'warn', // Prevents double imports from same file
      'import/no-self-import': 'error', // Prevents a file from importing itself
      'import/no-useless-path-segments': 'error', // Cleans up ./../src/ logic
    },
  },
  {
    // --- Layer 4: Structural & Complexity Gate ---
    // Errors, repo-wide. The legacy tree was brought into line in R5, so there is
    // no longer a backlog to keep green around — a new violation is a build
    // failure in `npm run lint`, ci:static and the PostToolUse hook alike.
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      complexity: ['error', 6],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-depth': ['error', 3],
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
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
