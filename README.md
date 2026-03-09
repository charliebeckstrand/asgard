# Yggdrasil

Hono + TypeScript Microservices

| Service | Role | Port |
| --- | --- | --- |
| **Heimdall** | Auth | `8000` |
| **Bifrost** | API | `3000` |
| **Saga** | Event Bus | `3001` |
| **Hermes** | WebSockets | `3002` |
| **Vidar** | Monitoring | `3003` |
| **Frigg** | Config Validation | `3004` |
| **Mimir** | Database Pool | |

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
