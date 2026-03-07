# Yggdrasil

Hono + TypeScript Microservices

| Service | Role | Port |
| --- | --- | --- |
| **Heimdall** | JWT authentication | `8000` |
| **Bifrost** | API gateway | `3000` |
| **Ratatoskr** | Event bus | `3001` |
| **Syn** | API proxy | |

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

GitHub Actions runs on push to `main` and on pull requests:

- **Bifrost**: lint, test, build (Node 22)
- **Ratatoskr**: lint, test, build (Node 22)
- **Syn**: lint, test, build (Node 22)
- **Heimdall**: lint, test, build (Node 22 + Postgres)

On push to `main`, a successful CI run triggers deployment to DigitalOcean App Platform.
