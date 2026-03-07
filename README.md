# Yggdrasil

A microservices monorepo with three services:

| Service | Language | Role | Port |
| --- | --- | --- | --- |
| **Heimdall** | Rust / Axum | JWT authentication & user management | `8000` |
| **Bifrost** | TypeScript / Hono | API gateway with OpenAPI docs | `3000` |
| **Syn** | TypeScript | Next.js auth SDK (route protection, session management, API proxy) | — (library) |

```
Next.js app
  └─ Syn (auth SDK)
       ├─ createAuth        → NextAuth sessions backed by Heimdall tokens
       ├─ createMiddleware  → Route protection
       └─ createProxyRoute  → Forwards API calls through Bifrost
              │
              ▼
          Bifrost (gateway)
              │
              ▼
          Heimdall (JWT issuer + user DB)
              │
              ▼
          PostgreSQL
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Rust (stable)
- PostgreSQL 16+ (or Docker)

## Quick Start

### 1. Start the database

```bash
cd services/heimdall
docker compose up -d
```

### 2. Configure environment variables

Create a `.env` in each service directory (see tables below).

### 3. Run services

```bash
# Terminal 1 — Heimdall
cd services/heimdall
cargo run

# Terminal 2 — Bifrost
cd services/bifrost
pnpm install && pnpm dev
```

## Environment Variables

### Heimdall

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | Postgres connection string |
| `SECRET_KEY` | yes | — | JWT signing secret |
| `PORT` | no | `8000` | Server port |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allowed origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | `7` | Refresh token lifetime |
| `HEIMDALL_API_KEY` | no | — | Optional API key for service-to-service auth |

### Bifrost

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Server port |
| `NODE_ENV` | no | `development` | `development`, `production`, or `test` |
| `HEIMDALL_URL` | no | — | Heimdall service URL (e.g. `http://localhost:8000`) |
| `HEIMDALL_API_KEY` | no | — | API key for Heimdall requests |

### Syn

Syn is a library — no env vars. Configuration is passed at call time via `apiOrigin`.

## Using Syn in a Next.js App

Install `syn` (or reference via workspace), plus its peer dependencies `next` and `next-auth`.

### Auth setup (`lib/auth.ts`)

```ts
import { createAuth } from "syn";

export const { auth, handlers, signIn, signOut } = createAuth({
  apiOrigin: process.env.API_ORIGIN!,
});
```

### Route protection (`middleware.ts`)

```ts
import { createMiddleware } from "syn";
import { auth } from "@/lib/auth";

export default createMiddleware({
  auth,
  publicPatterns: [/^\/auth(\/.*)?$/i],
});
```

### API proxy (`app/api/[...proxy]/route.ts`)

```ts
import { createProxyRoute } from "syn";
import { auth } from "@/lib/auth";

export const { GET, POST, PUT, PATCH, DELETE } = createProxyRoute({
  auth: { auth },
  apiOrigin: process.env.API_ORIGIN!,
});
```

## API Endpoints

### Heimdall

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, returns JWT tokens |
| `GET` | `/auth/me` | Get current user (Bearer token) |
| `DELETE` | `/auth/me` | Deactivate account |
| `POST` | `/token/refresh` | Refresh access token |
| `POST` | `/token/verify` | Verify token validity |
| `GET` | `/health` | Health check |

### Bifrost

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/users` | List users (paginated) |
| `GET` | `/users/:id` | Get user by ID |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |
| `GET` | `/docs` | Swagger UI |

## Development

Each service has its own scripts:

```bash
# Bifrost / Syn
pnpm dev          # Watch mode
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint with Biome

# Heimdall
cargo run         # Dev server
cargo test        # Run tests
cargo clippy      # Lint
cargo fmt --check # Format check
```

## CI/CD

GitHub Actions runs on push to `main` and on pull requests:

- **Bifrost**: lint, test, build (Node 22)
- **Syn**: lint, test, build (Node 22)
- **Heimdall**: fmt, clippy, test (Rust stable + Postgres)

On push to `main`, a successful CI run triggers deployment to DigitalOcean App Platform.
