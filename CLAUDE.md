# CLAUDE.md

## Project Overview

Yggdrasil is a TypeScript microservices monorepo with Norse mythology naming. It contains 4 services and 6 shared packages, built on Hono, PostgreSQL, and Node.js 22.

## Architecture

### Services (runtime applications)

| Service     | Port | Role                                           |
| ----------- | ---- | ---------------------------------------------- |
| **bifrost** | 3000 | API Gateway / BFF — routes `/api/*`, `/auth/*` |
| **hermes**  | 3001 | WebSocket messaging service                    |
| **huginn**  | 3002 | Event bus                                      |
| **vidar**   | 3003 | Security monitoring, IP ban enforcement        |

### Packages (shared libraries)

| Package      | Role                                                    |
| ------------ | ------------------------------------------------------- |
| **frigg**    | Config oracle, secrets generation, env validation (Zod) |
| **grid**     | Hono middleware, error handling, OpenAPI config         |
| **heimdall** | JWT auth, user registration, token management           |
| **mimir**    | PostgreSQL connection pool (lazy-loaded)                |
| **norns**    | Server lifecycle, graceful shutdown, signal handling    |
| **saga**     | Structured logging, PostgreSQL log ingestion            |

### Dependency Graph

Services depend on packages via `workspace:*` protocol:

- **bifrost** → frigg, grid, heimdall, mimir, norns
- **hermes** → frigg, grid, norns
- **huginn** → frigg, grid, mimir, norns
- **vidar** → frigg, grid, mimir, norns

## Commands

```bash
pnpm build          # Build all packages/services (Turbo-orchestrated)
pnpm dev            # Watch mode for all packages/services
pnpm test           # Run all tests
pnpm lint           # Lint with Biome
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format code with Biome
pnpm env:init       # Initialize environment secrets via Frigg CLI
pnpm env:rotate     # Rotate all secrets
```

### Scoped commands (via Turbo filter)

```bash
pnpm turbo build --filter=bifrost       # Build single service
pnpm turbo test --filter=heimdall       # Test single package
pnpm turbo build --filter=bifrost...    # Build service + its dependencies
```

## Code Style & Conventions

Add a blank line between distinct statements — variable declarations, function calls, assertions, and other standalone lines.

```typescript
// Bad
if (pool) {
	await closePool(pool)

	pool = null
}

// Good
if (pool) {
	await closePool(pool)

	pool = null
}
```

Exception: Lines that are visually connected (same pattern, same target) can stay grouped:

```typescript
// Good — no line break needed
app.use('*', cors())
app.use('*', logRequest())
```

### Formatting (enforced by Biome)

- **Indentation:** Tabs
- **Line width:** 100 characters
- **Quotes:** Single quotes
- **Semicolons:** Omitted when possible (as-needed)
- **Imports:** Auto-organized by Biome

### TypeScript

- Strict mode enabled
- Target: ES2022, Module: ESNext, Resolution: bundler
- ESM only — no CommonJS
- Node.js 22

### Patterns

- **Factory functions** for initialization: `createApp()`, `createPool()`, `createEnvironment()`
- **Middleware-driven architecture** — all services compose Hono middleware chains
- **Schema-driven APIs** — Zod schemas paired with `@hono/zod-openapi` for every endpoint
- **Lazy initialization** — e.g., Mimir pool connects on first use
- **Config injection** — config objects passed to package setup functions

### File Structure

```
<package|service>/
├── src/
│   ├── index.ts          # Main exports / entry point
│   ├── __tests__/        # Test files (*.test.ts)
│   ├── middleware/        # Middleware (services)
│   ├── routes/           # Route handlers (services)
│   ├── lib/              # Utilities, schemas, env config
│   └── handlers/         # Business logic
├── tsconfig.json         # Extends ../../tsconfig.base.json
├── tsup.config.ts        # Build config (ESM, node22, dist/)
└── package.json
```

## Testing

- **Framework:** Vitest with globals enabled (no need to import `describe`, `it`, `expect`)
- **Environment:** Node
- **Location:** `__tests__/` directories, files named `*.test.ts`
- **Path alias:** `@` → `./src`
- **Config:** `passWithNoTests: true`

### Common test patterns

```typescript
// Stub environment variables
vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test')

// Mock modules
vi.mock('heimdall', () => ({
	configure: vi.fn()
}))

// Test HTTP endpoints directly via Hono app
const app = createApp()

const res = await app.request('/api/health')

expect(res.status).toBe(200)
```

## Build Pipeline

**Turbo task dependency order:** packages build first (`^build`), then services.

- **tsup** bundles TypeScript → ESM (`dist/`)
- Build outputs are cached by Turbo (inputs: `src/**`, outputs: `dist/**`)
- `dev` tasks are persistent (watch mode) and depend on `^build` + `env:init`

## CI/CD

### GitHub Actions (`ci.yml`)

- Runs on PRs to `main` and pushes to `main`
- **Change-based:** only tests/builds packages affected by the diff
- Per-package jobs: `lint` → `test` → `build`
- Node.js 22, pnpm with frozen lockfile

### Deployment (`deploy.yml`)

- Triggers on push to `main`
- Deploys to **DigitalOcean App Platform** (NYC region)
- Each service runs as a separate container (1 vCPU, 0.5GB RAM)
- Path-based routing: `/api/*`, `/auth/*`, `/vidar/*`

## Pre-commit Hook

The Husky pre-commit hook runs `pnpm biome check`. All code must pass Biome linting before committing.

## Environment & Secrets

Managed by the **Frigg** package:

- `pnpm env:init` generates required secrets (DATABASE_URL, SECRET_KEY, SESSION_SECRET, etc.)
- Frigg validates env vars at startup using Zod schemas
- Production secrets are injected via CI/CD (DigitalOcean app spec)
