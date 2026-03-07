# Yggdrasil

A microservices monorepo with three services:

| Service | Language | Role | Port |
| --- | --- | --- | --- |
| **Heimdall** | Rust / Axum | JWT authentication | `8000` |
| **Bifrost** | TypeScript / Hono | API gateway | `3000` |
| **Syn** | TypeScript | Auth SDK / API proxy | |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Rust (stable)
- PostgreSQL 16+ (or Docker)

## Development

Each service has its own scripts:

```bash
# Bifrost / Syn
pnpm dev          # Watch mode
pnpm build        # Production build
pnpm test         # Run tests
pnpm lint         # Lint with Biome

# Heimdall
cargo run         # Dev server
cargo test        # Run tests
cargo clippy      # Lint
cargo fmt --check # Format check
```

## CI/CD

GitHub Actions runs on push to `main` and on pull requests:

- **Bifrost**: lint, test, build (Node 22)
- **Syn**: lint, test, build (Node 22)
- **Heimdall**: fmt, clippy, test (Rust stable + Postgres)

On push to `main`, a successful CI run triggers deployment to DigitalOcean App Platform.
