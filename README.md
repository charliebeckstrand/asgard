# Yggdrasil

Hono + TypeScript Microservices

## Services

| Service | Role | Port |
| --- | --- | --- |
| **[Bifrost](services/bifrost)** | API Gateway + Auth | `3000` |
| **[Saga](services/saga)** | Logging | `3001` |
| **[Hermes](services/hermes)** | WebSockets | `3002` |
| **[Huginn](services/huginn)** | Event Bus | `3003` |
| **[Vidar](services/vidar)** | Monitoring | `3004` |

## Packages

| Package | Description |
| --- | --- |
| **[Frigg](packages/frigg)** | Config, secrets, and environment resolution |
| **[Grid](packages/grid)** | Shared Hono middleware, schemas, and OpenAPI config |
| **[Heimdall](packages/heimdall)** | JWT authentication, user management, and Vidar integration |
| **[Mimir](packages/mimir)** | Shared PostgreSQL connection pool |
| **[Norns](packages/norns)** | Server lifecycle and graceful shutdown |

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+ (or Docker)

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
