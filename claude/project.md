# Project Overview

## Workspace Layout

Monorepo using pnpm workspaces + Turborepo. ESM throughout, TypeScript everywhere.

### Packages (`packages/`)
| Package | Purpose |
|---------|---------|
| **grid** | Shared utilities: Hono app factory, middleware, environment helpers |
| **heimdall** | JWT authentication primitives: login, register, token management, Argon2id hashing |
| **hlidskjalf** | (unexplored) |
| **saga** | Database query builder, PostgreSQL connection pool |
| **skuld** | Shared schemas and types (Zod): error, email, password, health |
| **vali** | Shared test/vitest configuration |

### Services (`services/`)
| Service | Port | Purpose |
|---------|------|---------|
| **bifrost** | 4000 | API gateway / BFF: auth endpoints, session management, user CRUD, health, OpenAPI docs |
| **hermes** | — | (unexplored) |
| **vidar** | 4002 | Rate limiting and security event tracking |

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Hono (with OpenAPI + Swagger UI)
- **Build**: tsup
- **Test**: Vitest
- **Lint/Format**: Biome
- **DB**: PostgreSQL (via saga)
- **Auth**: Argon2id passwords, HS256 JWTs (heimdall)

## Key Dependency Flow
```
bifrost → heimdall, grid, saga, skuld, vidar
heimdall → grid, hono
```

## Common Commands
- `pnpm build` / `pnpm dev` / `pnpm test` / `pnpm lint` / `pnpm format`
- Turbo orchestrates cross-package builds
