# Project Overview

## Workspace Layout

Monorepo using pnpm workspaces + Turborepo. ESM throughout, TypeScript everywhere.

### Packages (`packages/`)
| Package | Purpose |
|---------|---------|
| **grid** | Shared utilities: Hono app factory, middleware, environment helpers |
| **saga** | Database query builder, PostgreSQL connection pool |
| **skuld** | Shared schemas and types (Zod): error, email, password, health |
| **vali** | Shared test/vitest configuration |

### Services (`services/`)
| Service | Port | Purpose |
|---------|------|---------|
| **bifrost** | 4000 | API gateway / BFF: auth (JWT, Argon2id, login/register/refresh), session management, user CRUD, health, OpenAPI docs. Auth logic lives in `src/auth/`. |
| **vidar** | 4001 | Rate limiting and security event tracking |

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Hono (with OpenAPI + Swagger UI)
- **Build**: tsup
- **Test**: Vitest
- **Lint/Format**: Biome
- **DB**: PostgreSQL (via saga)
- **Auth**: Argon2id passwords, HS256 JWTs (in bifrost/src/auth/)

## Key Dependency Flow
```
bifrost → grid, saga, skuld, vidar
```

## Common Commands
- `pnpm build` / `pnpm dev` / `pnpm test` / `pnpm lint` / `pnpm format`
- Turbo orchestrates cross-package builds
