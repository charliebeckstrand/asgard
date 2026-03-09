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
| **[Heimdall](packages/heimdall)** | JWT authentication and user management |
| **[Saga](packages/saga)** | Structured log ingestion and querying |
| **[Mimir](packages/mimir)** | Shared PostgreSQL connection pool |
| **[Grid](packages/grid)** | Shared Hono middleware, schemas, and OpenAPI config |
| **[Norns](packages/norns)** | Server lifecycle and graceful shutdown |
| **[Frigg](packages/frigg)** | Config, secrets, and environment resolution |

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
