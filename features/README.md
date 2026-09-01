# Acceptance features (Layer 1 of the verification gauntlet)

Business intent expressed as Gherkin, verified over the real HTTP boundary. This
is the outermost layer of the pipeline described in
[`../CLAUDE.md`](../CLAUDE.md#agent-quality--mutation-testing-gauntlet).

## Layout

| Thing | Where | Naming |
|---|---|---|
| Feature files | `features/` | `<area>.feature` |
| Step definitions | colocated with the controller | `src/http/controllers/<area>/<area>.acceptance.spec.mts` |

Step-definition files are collected by the `acceptance` Vitest project
(`vitest run --project acceptance`, i.e. `npm run test:acceptance`), which uses
the Docker Postgres/Redis environment — bring the stack up first
(`docker compose up -d`).

## Writing one

1. Describe the behaviour in `features/<area>.feature` in terms a non-developer
   could read — endpoints, inputs, observable outputs. No implementation detail.
2. Create `src/http/controllers/<area>/<area>.acceptance.spec.mts`:

   ```ts
   import request from 'supertest'
   import { expect } from 'vitest'
   import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber'
   import { app } from 'app'

   const feature = await loadFeature('features/<area>.feature')

   describeFeature(feature, ({ Scenario, BeforeAllScenarios, AfterAllScenarios }) => {
     BeforeAllScenarios(async () => { await app.ready() })
     AfterAllScenarios(async () => { await app.close() })

     Scenario('<scenario name>', ({ Given, When, Then, And }) => {
       // one callback per step; step text matches the .feature line,
       // {string} / {number} become trailing args
     })
   })
   ```

3. `npm run test:acceptance` — every step must be green (100 %). A pending or
   undefined step is a failure, not a warning.

`health-check.feature` + `src/http/controllers/health-check/health-check.acceptance.spec.mts`
are a worked example.
