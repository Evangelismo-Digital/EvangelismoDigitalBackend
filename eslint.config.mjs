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
      'import/no-unresolved': 'error',        // Errors if the file doesn't exist
      'import/no-duplicates': 'warn',         // Prevents double imports from same file
      'import/no-self-import': 'error',       // Prevents a file from importing itself
      'import/no-useless-path-segments': 'warn', // Cleans up ./../src/ logic
    },
  },
  {
    // --- Layer 4: Structural & Complexity Gate ---
    // Kept at 'warn' repo-wide so `npm run lint` / ci:static stay green while the
    // legacy tree is brought into line. The PostToolUse hook lints each touched
    // file with `--max-warnings 0`, so these are blocking on changed code.
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      complexity: ['warn', 6],
      'max-lines-per-function': ['warn', { max: 30, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-depth': ['warn', 3],
      'import/no-cycle': ['warn', { maxDepth: Infinity, ignoreExternal: true }],
    },
  },
]