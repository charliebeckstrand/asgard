# Yggdrasil

Hono + TypeScript Microservices

| Service | Role | Port |
| --- | --- | --- |
| **Heimdall** | Authentication | `8000` |
| **Bifrost** | API gateway | `3000` |
| **Syn** | API proxy | |
| **Saga** | Events | `3001` |
| **Vidar** | Monitoring | `3002` |
| **Frigg** | Secrets Management | `3003` |
| **Mimir** | Database connection | |

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
