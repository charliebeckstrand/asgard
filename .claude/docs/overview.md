# Overview

Asgard is the backend for Ivory Image: Hono services in one pnpm and Turborepo workspace. Node 24 (`.nvmrc`), TypeScript 7, ESM, Vitest, Biome, Knip. The frontend is [midgard](midgard.md).

## Layout

Shared packages in `packages/` never import from `services/`.

- `skuld`: shared Zod schemas.
- `grid`: the service kit. `createApp` (OpenAPI docs at `<basePath>/docs`), error handling, request logging, SSE, the health route, `createEnvironment`, the manifest-driven env sync, `setupLifecycle`, and the `clientIp` and `rateLimit` middleware (per address, or per any key).
- `saga`: Postgres. `createDb`, the `sql` template, file migrations and the `saga` CLI (`migrate`, `status`, `new <name>`), pino logging, and `saga-bootstrap` for local roles and databases.
- `vali`: test helpers. See the `test-quality` skill.

Services in `services/`. Each has `manifest.json`, `migrations/`, `src/index.ts` (starts the server), `src/app.ts` (builds the routes) and `src/lib/{db,env,log}.ts`.

- `bifrost` (port 4000, `/api`, public at auth.ivoryimage.dev): accounts and sign-in. Passwords, passkeys, authenticator apps, GitHub and Google OAuth, email verification and password reset through Resend, sessions, roles, and the admin-only `/api/security` routes that read Vidar.
- `mimir` (port 4002, `/api`, private): apps' data, today the places app's places and visited regions, stored as one JSON document per user and name. Behind an API key. Bifrost checks the session and forwards `/api/places/*` and `/api/visits/*` unchanged with the user in `x-mimir-user`; Mimir declares each route's role and limits each user's requests. Bifrost itself calls Mimir's `/api/account` to export or delete all of a user's data. A new app's data gets its own routes and handlers here, not a new service.
- `vidar` (port 4001, `/vidar`, private): security events, threat rules and IP bans, behind an API key. Bifrost uses `vidar/client`: `banCheck`, `reportEvent`, and the admin reads, which answer 503 when Vidar is down.

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm knip`. CI runs `pnpm turbo run lint typecheck test build` and then `pnpm knip`, and builds each service's Docker image on pull requests.
- `pnpm dev` starts Postgres in Docker, creates the local roles and databases, applies migrations, and runs every service through `hlidskjalf`.
- `pnpm --filter <service> db:migrate` and `db:status` run against the service's `.env`. `pnpm --filter <service> exec saga new <name>` adds a migration.
- `pnpm --filter bifrost openapi` and `pnpm --filter mimir openapi` rewrite each service's `openapi.json`. A test fails when a spec and its routes differ.

## Environment

Each service's `.env` is generated from its `manifest.json` and the secrets cache (`.secrets.json`, git-ignored). Change the manifest, never the `.env`. `pnpm env:init` writes the files and `pnpm env:rotate` makes new secrets. A new variable goes in both `manifest.json` and `src/lib/env.ts`.

## Deploy

A push to `main` runs CI, then applies `.do/app.yaml` to the `asgard` app on DigitalOcean App Platform. The spec's comments explain each part. In short: bifrost, vidar and mimir run from the one Dockerfile (`SERVICE` build arg); a `PRE_DEPLOY` job per service runs `saga migrate` as the admin user; each service connects as its own user, which can read and write rows but not change the schema; logs go to Better Stack.

Renovate's minor and patch updates (`renovate.json`) merge themselves once CI passes, so they deploy like any other push.

## Cloud sessions

- The SessionStart hook installs Node 24 and the pinned pnpm.
- There is no Docker, so `*.integration.test.ts` skip. A skip is not a pass: CI runs them.
- For a real Postgres without Docker, `npm i @embedded-postgres/linux-x64` in a scratch directory gives PG 18 binaries. Run `initdb` and `pg_ctl` as `nobody` (root is refused).
- auth.ivoryimage.dev and docs.digitalocean.com are blocked. For App Platform spec values, read `apps.gen.go` in the digitalocean/godo repo.
- pnpm refuses packages published less than a day ago. When a fresh release fails to install, pin the one before it.

## Conventions

Beyond what Biome enforces:

- A blank line between most statements, in source and tests.
- Relative imports end in `.js`. Type-only imports use `import type`.
- Routes chain `.route()` so the app's type carries them.
- Commit subjects are `type(scope): summary`, in the imperative.
- When Knip flags an export used only in its own file, drop the `export`. Don't add an ignore.
