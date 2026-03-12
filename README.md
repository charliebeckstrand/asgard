# Yggdrasil

Microservices built with TypeScript snd Hono

## Services

| Service | Role | Port |
| --- | --- | --- |
| **[Bifrost](services/bifrost)** | API | `3000` |
| **[Hermes](services/hermes)** | RPC | `3001` |
| **[Vidar](services/vidar)** | Monitoring | `3002` |

## Packages

| Package | Description |
| --- | --- |
| **[Heimdall](packages/heimdall)** | Authentication |
| **[Saga](packages/saga)** | Database |
| **[Skuld](packages/skuld)** | Schemas |
| **[Grid](packages/grid)** | Factories/Middleware |
| **[Rune](packages/rune)** | UI |
| **[Hlidskjalf](packages/hlidskjalf)** | CLI |

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
