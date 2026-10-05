---
name: test-quality
description: Asgard test conventions for Vitest + Biome. Invoke this skill BEFORE writing or editing any test file in this repo (`*.test.ts`, `*.spec.ts`, files under `__tests__/`). Covers formatting, mocking patterns, integration-test setup, and the reusable utilities exported by `vali` that you should prefer over hand-rolling.
---

# Test quality conventions — Asgard

Apply these rules every time a test file is authored or modified. They reflect the patterns used across `packages/` and `services/` and the conventions Biome will enforce on save.

## Formatting

- **Blank line between consecutive `expect()` calls.** This is the house style across the suite. Biome doesn't enforce it, so it's on the author.

  ```ts
  // ✗ wrong
  expect(res.status).toBe(200)
  expect(body.id).toBe('user-1')
  expect(body.email).toBe('a@b.com')

  // ✓ right
  expect(res.status).toBe(200)

  expect(body.id).toBe('user-1')

  expect(body.email).toBe('a@b.com')
  ```

- **Blank line between Arrange / Act / Assert blocks** (mock setup, request, assertions).
- **Tabs, single quotes, no semicolons, 100-char line width** — Biome handles this; never fight the formatter.
- Run `pnpm --filter <pkg> run lint:fix` (or rely on the pre-commit hook) before committing.

## File layout

- Colocate tests under `src/__tests__/` (or `src/<area>/__tests__/`) mirroring the source path.
- Naming: `<source>.test.ts` for unit/route tests, `<source>.integration.test.ts` for tests that need a real Postgres testcontainer.
- Use the `@/` alias (`@/handlers/rules`) when importing from the source root in vidar; relative imports (`../../auth/index.js`) elsewhere — match the surrounding file.

## Reuse vali utilities — do not rebuild

The `vali` package centralizes the patterns that used to be duplicated. When you need any of these, import from `vali`:

| You need… | Import from |
|---|---|
| Stub the standard service env (`DATABASE_URL`, `APP_ORIGINS`) | `stubServiceEnv` from `vali/env` |
| Start a Postgres testcontainer | `startPostgres` from `vali/containers` |
| Apply a service's migrations to it | `migrate` from `saga` |
| Skip a suite when Docker is unavailable | `isDockerAvailable() ? describe : describe.skip` |

If you find yourself re-implementing one of these, stop and import from `vali` instead. If a new pattern is being duplicated across two or more test files, propose extracting it into `vali` (CLAUDE.md: "abstractions are extracted, not predicted" — but two uses earns the abstraction).

## Mocking patterns

### Standard ESM mock (synchronous)

Hoist mock state with `vi.hoisted` so the `vi.mock` factory can reference it. **Place `stubServiceEnv()` and `vi.hoisted` before any source imports** — module evaluation reads `process.env` and the mocks need to be in place first.

```ts
import { stubServiceEnv } from 'vali/env'

stubServiceEnv()

const { mockRepo } = vi.hoisted(() => ({
    mockRepo: { getUsers: vi.fn(), getUserById: vi.fn() },
}))

vi.mock('../lib/repo.js', () => ({ createRepo: () => mockRepo }))

import { createApp } from '../app.js'
```

### Repositories against a real database

Bifrost's repositories take the database as an argument, so integration tests pass one in; no module mocking. `startTestDb()` in `services/bifrost/src/lib/__tests__/test-db.ts` starts Postgres with bifrost's migrations applied, and `reset()` empties every table.

```ts
let testDb: TestDb
let users: UserRepository

beforeAll(async () => {
    if (!isDockerAvailable()) return

    testDb = await startTestDb()

    users = createUserRepository(testDb.db)
}, 60_000)

afterAll(async () => {
    await testDb?.stop()
})

beforeEach(async () => {
    if (!isDockerAvailable()) return

    await testDb.reset()
})
```

### Mocking the standard `db` module

For service tests that don't need a real DB, mock `lib/db.js` to a noop:

```ts
vi.mock('../lib/db.js', () => ({
    db: { ping: vi.fn().mockResolvedValue(true) },
}))
```

### Mocking `vidar/client`

Bifrost service tests should pass-through Vidar's ban check:

```ts
vi.mock('vidar/client', () => ({
    configure: vi.fn(),
    banCheck: vi.fn().mockReturnValue(async (_c: unknown, next: () => Promise<void>) => {
        await next()
    }),
    reportEvent: vi.fn(),
}))
```

## Integration tests (testcontainers)

- Suffix the file `*.integration.test.ts` so coverage tooling can target them separately if needed.
- Gate with `const describeWithDocker = isDockerAvailable() ? describe : describe.skip`.
- Use `beforeAll(async () => { ... }, 60_000)` for container startup — the default 5s timeout is not enough.
- Empty the tables in `beforeEach` (bifrost: `testDb.reset()`).
- Apply migrations from `<service>/migrations` via saga's `migrate({ url }, migrationsDir)` rather than re-encoding schema in the test (drift risk). Bifrost's `startTestDb()` does this.

## Async assertions — prefer `vi.waitFor`

For fire-and-forget code paths (e.g. `reportEvent`), wait on the assertion rather than sleeping:

```ts
// ✗ flaky
await new Promise((r) => setTimeout(r, 10))

expect(fetchMock).toHaveBeenCalled()

// ✓ robust
await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalled()
})
```

## Test isolation

- `beforeEach(() => { vi.clearAllMocks() })` to reset call history. `vi.resetAllMocks()` if the mock impl needs to be re-stubbed.
- `afterAll` to stop containers and close pools.
- Don't share mutable state between tests — declare per-test fixtures in the `it` body or a `beforeEach`.
- Freeze the clock in tests that depend on elapsed time, such as rate-limit buckets: `vi.useFakeTimers()` in `beforeEach` (`{ toFake: ['Date'] }` when only `Date.now()` matters) and `vi.useRealTimers()` in `afterEach`. On a slow runner the bucket refills mid-test.

## Naming

- `describe('<component or function>', ...)` — the unit under test.
- Inner `describe` blocks group by behavior: routes, methods, error paths.
- `it('does X when Y')` — present tense, behavior-focused. Avoid "should".
- `it.each([...])` for table-driven cases (e.g. one assertion across HTTP methods).

## What "quality" looks like in a review

Before finishing a test file, confirm:

1. ☐ Blank lines between `expect`s and around AAA blocks.
2. ☐ All `vi.hoisted` / `vi.mock` calls come **before** source imports.
3. ☐ No re-implementation of vali utilities (env stubbing, migrations).
4. ☐ Integration tests are Docker-gated and have a 60s `beforeAll` timeout.
5. ☐ No `setTimeout(..., N)` polling — `vi.waitFor` instead.
6. ☐ No dead mocks (`vi.fn()` declared but never asserted on or read by the test).
7. ☐ `describe`/`it` names describe the behavior, not the implementation.
8. ☐ `lint` is clean (`pnpm --filter <pkg> run lint`).
9. ☐ `test` passes (`pnpm --filter <pkg> run test`).
