# Yggdrasil

TypeScript Microservices (Hono + Turborepo)

## Services

| Service | Role | Port |
| --- | --- | --- |
| **[Bifrost](services/bifrost)** | API Gateway | `3000` |
| **[Hermes](services/hermes)** | WebSockets | `3001` |
| **[Huginn](services/huginn)** | Event Bus | `3002` |
| **[Vidar](services/vidar)** | Monitoring | `3003` |

## Packages

| Package | Description |
| --- | --- |
| **[Heimdall](packages/heimdall)** | JWT auth guard |
| **[Mimir](packages/mimir)** | PostgreSQL connection pool |
| **[Saga](packages/saga)** | PostgreSQL logging and search |
| **[Norns](packages/norns)** | Hono server lifecycle handling |
| **[Grid](packages/grid)** | Hono middleware, proxy, SSE streaming, auth, and schemas |
| **[Frigg](packages/frigg)** | Environment secrets provisioning |

## Architecture

Bifrost acts as the API gateway, proxying requests to downstream services:

- `/events/*` -> Huginn (event bus)
- `/vidar/*` -> Vidar (security monitoring)
- `/auth/*`, `/api/*` -> handled directly by Bifrost

All services share a common middleware stack via `createApp()`:

- CORS, secure headers, request logging
- Server-Timing headers (via `hono/timing`)
- Compression and ETag caching
- Trailing slash normalization

### Authentication

- **Browser clients**: Cookie-based sessions with CSRF protection (Bifrost)
- **Service-to-service**: Bearer token auth (`Authorization: Bearer <key>`)
- **WebSocket**: API key via query parameter (Hermes)

### Real-time

- **WebSocket**: Full-duplex messaging via Hermes
- **SSE**: Event streaming via Huginn (`GET /events/stream`) and Vidar (`GET /vidar/stream`)

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+ (or Docker 20.10+)

## Development

Each service has its own scripts:

```bash
pnpm dev          # Watch mode
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint with Biome
```

## CI/CD

GitHub Actions runs on push to `main` and on pull requests.

A successful CI run triggers deployment to DigitalOcean App Platform.
