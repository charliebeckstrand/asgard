# Yggdrasil

Microservices built with TypeScript snd Hono

## Services

| Service | Role | Port |
| --- | --- | --- |
| **[Bifrost](services/bifrost)** | API | `3000` |
| **[Hermes](services/hermes)** | WebSockets | `3001` |
| **[Vidar](services/vidar)** | Monitoring | `3002` |

## Packages

| Package | Description |
| --- | --- |
| **[Hlidskjalf](packages/hlidskjalf)** | CLI |
| **[Saga](packages/saga)** | Database |
| **[Skuld](packages/skuld)** | Schemas |
| **[Vali](packages/vali)** | Testing |
| **[Grid](packages/grid)** | Middleware |
| **[Heimdall](packages/heimdall)** | Auth |
| **[Rune](packages/rune)** | UI |

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
