# Yggdrasil

Microservices built with TypeScript snd Hono

## Services

| Service | Role | Port |
| --- | --- | --- |
| **[Bifrost](services/bifrost)** | API | `3000` |
| **[Hermes](services/hermes)** | RPC | `3001` |
| **[Huginn](services/huginn)** | Event Bus | `3002` |
| **[Vidar](services/vidar)** | Monitoring | `3003` |

## Packages

| Package | Description |
| --- | --- |
| **[Heimdall](packages/heimdall)** | Authentication |
| **[Norns](packages/norns)** | Hono server lifecycle |
| **[Grid](packages/grid)** | Shared factories |
| **[Mimir](packages/mimir)** | PostgreSQL connection pool |
| **[Saga](packages/saga)** | PostgreSQL logging |

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
