# Getting to hands-off agents on your projects

## The thing nobody tells you

The people you met aren't running a different model than you. They removed
themselves from the loop by replacing *human* review with *machine* review.

When you approve a bash command, you're acting as a runtime safety check. When
you read every diff, you're acting as a correctness check. An agent can only run
unsupervised if both of those jobs are done by something that doesn't sleep:

| Your current job | What replaces it |
|---|---|
| "Should this command run?" | `permissions` rules in `settings.json` + hooks |
| "Is this code correct?" | tests, types, linters, mutation score |
| "Did it actually finish?" | a `Stop` hook that refuses to let it stop |

If you skip permissions without the second column in place, you haven't
automated anything — you've just removed the brakes.

---

# Part 1 — Permissions

## Where settings live

Four layers, merged. Later layers can't remove a `deny` from an earlier one.

```
~/.claude/settings.json           # you, all projects
.claude/settings.json             # this project, committed to git
.claude/settings.local.json       # this project, gitignored, personal
managed-settings.json             # org policy (not relevant for you yet)
```

Rules are evaluated **deny → ask → allow**. First match wins. A `deny` beats
every `allow`, and it beats `bypassPermissions` mode too. That's the property
that makes this safe.

## Permission modes

Set with `defaultMode`, or per-session with `--permission-mode`:

- `default` — asks for anything not pre-approved
- `plan` — read and explore only, no edits (great for a first pass on a task)
- `acceptEdits` — file edits go through silently, shell commands still ask
- `auto` — Claude Code decides, escalating to you on risky calls
- `dontAsk` — anything not explicitly allowed is **denied** instead of prompting
- `bypassPermissions` — skips prompts entirely

`dontAsk` is the mode you actually want for unattended runs. It never blocks
waiting for a human, but it also never runs something you didn't whitelist.
`bypassPermissions` belongs in a throwaway Docker container with no host mount
and no real credentials — not on your laptop, which has your SSH keys and your
UFF / junior enterprise repos on it.

## Your global baseline

`~/.claude/settings.json` — safe everywhere, never project-specific:

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/id_rsa*)",
      "Read(**/.aws/**)",
      "Read(**/.ssh/**)",
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(chmod 777 *)",
      "Bash(git push --force*)",
      "Bash(git push -f *)",
      "Bash(git reset --hard*)",
      "Bash(git clean -fd*)",
      "Bash(curl * | sh)",
      "Bash(curl * | bash)",
      "Bash(wget * | sh)",
      "Bash(npm publish*)",
      "Bash(docker system prune*)",
      "Bash(kubectl delete*)",
      "Bash(psql *DROP*)",
      "Bash(:(){ :|:& };:)"
    ],
    "ask": [
      "Bash(git push*)",
      "Bash(gh pr merge*)",
      "Bash(npm install*)",
      "Bash(pip install*)",
      "Bash(docker compose down*)"
    ]
  }
}
```

The `ask` list is the interesting one. These are things you *want* to happen
eventually but want to know about — so in `default` mode they prompt, and in
`dontAsk` mode they're simply refused, which means an unattended agent physically
cannot push to your remote. It writes commits; you push.

## Per-project: Digital Evangelism (Node / TS / Prisma / BullMQ)

`.claude/settings.json`, committed:

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(npm run *)",
      "Bash(npm test*)",
      "Bash(npx tsc*)",
      "Bash(npx prisma generate*)",
      "Bash(npx prisma migrate dev*)",
      "Bash(npx vitest*)",
      "Bash(npx jest*)",
      "Bash(npx eslint*)",
      "Bash(npx prettier*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git add*)",
      "Bash(git commit*)",
      "Bash(git checkout -b *)",
      "Bash(git stash*)",
      "Bash(docker compose up -d*)",
      "Bash(docker compose logs*)",
      "Bash(docker compose ps*)",
      "Bash(redis-cli ping)",
      "Edit(src/**)",
      "Edit(tests/**)",
      "Edit(prisma/schema.prisma)"
    ],
    "deny": [
      "Bash(npx prisma migrate deploy*)",
      "Bash(npx prisma migrate reset*)",
      "Bash(npx prisma db push*)",
      "Bash(redis-cli FLUSHALL*)",
      "Bash(redis-cli FLUSHDB*)",
      "Edit(.env*)",
      "Edit(docker-compose.prod.yml)"
    ]
  }
}
```

Note `migrate dev` is allowed but `migrate deploy` and `reset` are denied. The
agent can evolve the schema on your local dev database and get blocked from
touching anything that resembles production or wiping your Redis queues.

## Per-project: TDDAgents / photosphere (Python)

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(pytest*)",
      "Bash(python -m pytest*)",
      "Bash(ruff*)",
      "Bash(mypy*)",
      "Bash(black*)",
      "Bash(mutmut run*)",
      "Bash(mutmut results*)",
      "Bash(coverage*)",
      "Bash(python -m venv*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git add*)",
      "Bash(git commit*)",
      "Edit(src/**)",
      "Edit(tests/**)"
    ],
    "deny": [
      "Bash(pip install --upgrade pip*)",
      "Edit(data/**)",
      "Edit(results/**)"
    ]
  }
}
```

For the paper repo, denying edits to `data/` and `results/` matters: you do not
want an agent silently regenerating the mutation-testing numbers you're citing.

## Discovering your own allow list

Don't write it from imagination. Run normally for two or three sessions, and
every time you catch yourself clicking approve on the same thing, add it. Then:

```
/permissions
```

shows you the merged effective policy and which file each rule came from.

## Hooks: the gates rules can't express

Permission rules are static patterns. Hooks are code, and they run every time —
they don't depend on the model remembering an instruction.

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/format-and-typecheck.sh",
            "args": [],
            "timeout": 120
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/gate.sh",
            "args": [],
            "timeout": 900
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/format-and-typecheck.sh`:

```bash
#!/bin/bash
# Runs after every file write. Fast feedback only — no full test suite here.
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0

case "$file" in
  *.ts|*.tsx)
    npx prettier --write "$file" >/dev/null 2>&1
    if ! npx tsc --noEmit 2>&1 | head -20 > /tmp/tsc.out; then
      cat /tmp/tsc.out >&2
      exit 2   # exit 2 shows stderr to Claude, who then fixes it
    fi
    ;;
  *.py)
    black -q "$file" 2>/dev/null
    if ! ruff check "$file" 2>&1 | head -20 >&2; then exit 2; fi
    ;;
esac
exit 0
```

`.claude/hooks/gate.sh` — the important one. It fires when Claude thinks it's
finished, and exit code 2 refuses to let it stop:

```bash
#!/bin/bash
# Anti-loop guard: only enforce once per turn.
input=$(cat)
session=$(jq -r '.session_id' <<<"$input")
guard="/tmp/claude-gate-$session"
if [ -f "$guard" ] && [ $(( $(date +%s) - $(stat -c %Y "$guard") )) -lt 60 ]; then
  rm -f "$guard"; exit 0
fi
touch "$guard"

if ! npm test 2>&1 | tail -40 > /tmp/gate.out; then
  echo "Test suite is failing. Fix it before finishing:" >&2
  cat /tmp/gate.out >&2
  exit 2
fi
rm -f "$guard"
exit 0
```

That anti-loop guard is not optional. A `Stop` hook that always exits 2 creates
an infinite loop — Claude finishes, the hook says keep going, Claude finishes
again, forever, burning tokens the whole time.

---

# Part 2 — The testing layers

## Why this comes first, not second

Rule of thumb: **an agent can be trusted with exactly as much autonomy as your
test suite can verify.** On Digital Evangelism, if a queue consumer has no test,
an autonomous agent rewriting it is unverified code going straight to your repo.
Autonomy is downstream of coverage, not independent of it.

You already know this better than most people — the TDDAgents Red-Green loop is
literally this idea. What you're building here is the same loop, applied to
yourself instead of to a paper.

## The five layers and where each one runs

| Layer | Runs | Speed | Purpose |
|---|---|---|---|
| Static (types, lint) | after every file edit, via hook | < 5s | catches nonsense instantly |
| Unit | after every logical change | < 30s | the agent's inner loop |
| Integration | before the agent stops, via `Stop` hook | 1–5 min | real Redis, real Postgres |
| Regression | CI, on every PR | any | the bug that came back |
| Mutation | CI nightly, or manual | slow | proves tests actually assert |

The critical split: what runs in the agent's loop must be **fast**, or the agent
spends its context waiting. Mutation testing never belongs in the inner loop.

## Setting up each layer — Node side

**Static.** `tsconfig.json` with `"strict": true`, and add
`"noUncheckedIndexedAccess": true`. This one flag catches a whole class of bug
that AI-written code produces constantly.

**Unit.** Vitest, tests colocated as `*.test.ts`. For BullMQ, this means testing
your job *handlers* as plain functions, separately from the queue. If your
handler logic is tangled into the worker registration, untangle it first — that
refactor is the single highest-leverage thing you can do for testability.

**Integration.** `docker-compose.test.yml` with a throwaway Redis and Postgres
on non-default ports. Testcontainers if you want it self-managing. These test
the actual queue: enqueue a job, run the worker, assert the side effect and
assert the Prometheus counter incremented. Your distributed lock logic needs a
test that runs two workers concurrently and asserts only one wins.

**Regression.** A `tests/regression/` folder with one rule written in your
`CLAUDE.md`: every bug fix adds a test named after the issue, and that test must
fail on the old code.

**Mutation.** Stryker for TS. Run it weekly on `src/` core logic only, not the
whole repo. A surviving mutant means a test that runs code without asserting
anything about it — exactly the kind of hollow test an AI writes when you tell it
to "add tests."

## Python side

You're already running `mutmut` for the paper, so the muscle exists. Same shape:
`pytest` + `pytest-cov` in the loop, `mypy --strict` and `ruff` in the hook,
`mutmut run` nightly. Add `hypothesis` for the photosphere geometry code — set
coverage optimization is exactly the kind of thing where property-based tests
find edge cases that example-based tests miss.

## The CLAUDE.md that ties it together

Put this at your project root. Keep it short — a 500-line CLAUDE.md gets ignored
because it dilutes; a 60-line one gets followed.

```markdown
# Project: Digital Evangelism (backend)

Node 20 · TypeScript strict · BullMQ + Redis · Prisma + Postgres · Vitest

## The loop — non-negotiable

1. Before writing code, write a failing test. Run it. Confirm it fails
   for the reason you expect.
2. Write the minimum code to pass it.
3. Run `npm test`. All green before moving on.
4. Refactor only with the suite green.

Never mark a task complete with a failing or skipped test. If a test is
genuinely wrong, say so explicitly and explain why — do not silently
delete it, weaken its assertion, or add `.skip`.

## Commands

- `npm test` — unit, fast
- `npm run test:integration` — needs `docker compose -f docker-compose.test.yml up -d`
- `npm run typecheck` — tsc --noEmit
- `npm run lint`

## What a good test looks like here

- Assert on observable behavior, not implementation details.
- Every job handler gets a unit test for: success, retryable failure,
  permanent failure, and idempotent re-delivery.
- Every metric gets a test asserting the counter moved.
- No test may sleep. Use fake timers.
- A test that passes when you delete the function body is not a test.

## Boundaries

- Do not edit `.env`, `prisma/migrations/*`, or anything under `data/`.
- Do not run `prisma migrate deploy` or `reset`.
- Do not push. Commit freely on a branch; I push.
- If a change touches the locking or retry logic, stop and explain the
  reasoning before implementing.

## Style

Portuguese for user-facing strings and commit messages. English for
code, comments, and test names.
```

The "do not silently weaken a test" line matters more than it looks. The most
common failure mode of an unsupervised agent is not writing bad code — it's
making the red light green by editing the light.

---

# Part 3 — How to migrate your existing projects

Don't do all of this at once. In order:

**Week 1 — measure.** Run `npx vitest --coverage` (or `pytest --cov`) on Digital
Evangelism and write down the number. That number is your current autonomy
ceiling. Don't change any permission settings yet.

**Week 2 — the hook, still supervised.** Add the `PostToolUse` format-and-typecheck
hook and the `Stop` gate hook. Keep approving everything manually. You're
checking that the gates actually catch things before you trust them.

**Week 3 — cover the core.** Point Claude Code at your untested job handlers and
have it write tests, *with you reviewing those tests carefully*. Reviewing tests
is much cheaper than reviewing implementation, and it's the last thing you should
stop doing. Target the queue consumers and the locking logic first.

**Week 4 — `acceptEdits`.** Turn on `"defaultMode": "acceptEdits"` in the project
settings. Edits flow, shell still asks. Live with it for a week.

**Week 5 — build the allow list.** Every prompt you approve twice becomes an
allow rule. Your list will hit twenty or thirty entries and stabilize.

**Week 6 — `dontAsk` on a branch.** Give it a real task on a feature branch and
walk away. Come back to a PR. Review the PR, not the diffs.

The moment to expand autonomy is when the gates have caught something you would
have missed. That's the evidence. Until then you're guessing.

## The one habit that matters most

Review **pull requests**, not tool calls. That's the actual change those CEOs
made. They didn't stop reviewing — they moved their review to a coarser
granularity where their judgment is worth more. Reading a diff hunk-by-hunk in a
terminal is a job for a computer. Deciding whether the whole feature is the right
feature is a job for you.

## Next: parallelism

Once the above is stable, `git worktree` lets you run three or four agents on
separate branches from the same repo without collision, and Claude Code's
`--worktree` flag automates the setup. Ask me when you get there — it's a real
speedup, but it's worthless without the gates in place first.
