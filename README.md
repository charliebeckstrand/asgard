# Bifrost

API gateway and Backend-for-Frontend (BFF) bridging services. Built with [Hono](https://hono.dev), [Zod](https://zod.dev), and TypeScript.

Bifrost ships two exports:

- **`bifrost`** — a lightweight API gateway with OpenAPI documentation, request validation, and built-in auth middleware.
- **`bifrost/heimdall`** — a Next.js SDK for authentication, route protection, and proxying requests to the gateway.

## Getting Started

### Prerequisites

- Node.js v22+
- pnpm 10+

### Installation

```bash
pnpm install
```

### Environment Variables

Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `IRONCLAD_URL` | Auth service endpoint | `http://localhost:3001` |
| `IRONCLAD_API_KEY` | Auth service API key | — |

### Development

```bash
pnpm dev        # Start dev server with watch mode
pnpm build      # Build for production
pnpm start      # Run production build
```

### Testing & Linting

```bash
pnpm test       # Run tests
pnpm test:watch # Run tests in watch mode
pnpm lint       # Check code quality
pnpm lint:fix   # Auto-fix lint issues
pnpm format     # Format code
```

## Bifrost (API Gateway)

The gateway runs on Hono and auto-generates an OpenAPI spec from Zod schemas.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check with uptime and service status |
| `GET` | `/users` | List users (paginated) |
| `GET` | `/users/:id` | Get user by ID |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |
| `GET` | `/docs` | Swagger UI |

### Client

Generate a type-safe client from the OpenAPI spec:

```bash
pnpm generate:client
```

Then use it in your application:

```ts
import { createClient } from "bifrost";

const api = createClient({ baseUrl: "http://localhost:3000" });

const users = await api.get("/users", { query: { page: 1, limit: 20 } });
```

## Heimdall (Next.js SDK)

Heimdall connects your Next.js app to Bifrost. Install `next` and `next-auth` as peer dependencies, then import from `bifrost/heimdall`.

### `createAuth(config)`

Wraps NextAuth with credential-based authentication and automatic token refresh.

```ts
import { createAuth } from "bifrost/heimdall";

export const { auth, handlers, signIn, signOut } = createAuth({
  apiOrigin: process.env.API_ORIGIN,
  maxAge: 3600,
});
```

### `createMiddleware(config)`

Protects routes and redirects unauthenticated users to a login page.

```ts
import { createMiddleware } from "bifrost/heimdall";

export default createMiddleware({
  auth,
  publicPatterns: [/^\/auth\//],
});
```

### `createProxyRoute(config)`

Creates a catch-all App Router handler that forwards requests to the upstream API, injecting the session bearer token automatically.

```ts
import { createProxyRoute } from "bifrost/heimdall";

export const { GET, POST, PUT, PATCH, DELETE } = createProxyRoute({
  auth,
  apiOrigin: process.env.API_ORIGIN,
});
```

## Tech Stack

| Category | Technology |
| --- | --- |
| Runtime | Node.js 22 |
| Language | TypeScript |
| Framework | Hono |
| Validation | Zod |
| API Docs | @hono/zod-openapi, @hono/swagger-ui |
| Auth (Heimdall) | NextAuth v5 |
| Build | tsup |
| Test | Vitest |
| Lint / Format | Biome |
| Package Manager | pnpm |
