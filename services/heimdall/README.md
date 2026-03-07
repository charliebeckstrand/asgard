# Sigil

A lightweight JWT authentication service built with Rust. Provides user registration, login, token refresh, and account management via REST API.

## Tech Stack

Rust, Axum, SQLx, PostgreSQL, Argon2, JWT

## Getting Started

### Prerequisites

- Rust 1.88+ (or Docker)
- PostgreSQL 16

### Quick Start with Docker Compose

```bash
cp .env.example .env
docker-compose up
```

This starts PostgreSQL and the Sigil service at `http://localhost:8000`.

### Building from Source

```bash
# Set required environment variables
export DATABASE_URL=postgres://sigil:sigil@localhost:5432/sigil
export SECRET_KEY=$(openssl rand -hex 32)

# Build and run
cargo build --release
cargo run
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Health check | No |
| `POST` | `/auth/register` | Register a new user | No |
| `POST` | `/auth/login` | Login (returns access + refresh tokens) | No |
| `POST` | `/token/refresh` | Refresh an access token | No |
| `POST` | `/token/verify` | Verify an access token | API key |
| `GET` | `/auth/me` | Get current user | Bearer |
| `DELETE` | `/auth/me` | Deactivate account | Bearer |

### Example

```bash
# Health
curl -X GET http://localhost:8000/health -H "Content-Type: application/json"

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepass123"}'

# Get current user
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <access_token>"

# Verify a token (service-to-service)
curl -X POST http://localhost:8000/token/verify \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your_api_key>" \
  -d '{"token": "<access_token>"}'
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SECRET_KEY` | Yes | — | JWT signing secret |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `PORT` | No | `8000` | Server port |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Refresh token lifetime |
| `SIGIL_API_KEY` | No | — | API key for `/token/verify` (disabled when unset) |
| `RUST_LOG` | No | `sigil=info,tower_http=info` | Log level filter |

## Secrets Management

This project uses [dotenvx](https://dotenvx.com) to manage encrypted secrets. See the dotenvx docs for usage.

### Required GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `DIGITALOCEAN_ACCESS_TOKEN` | DigitalOcean API token |
| `DOTENV_PRIVATE_KEY_PRODUCTION` | Private key from `.env.keys` |

## Project Structure

```
├── src/
│   ├── main.rs          # App setup, routing, middleware
│   ├── handlers.rs      # HTTP route handlers
│   ├── models.rs        # Request/response types
│   ├── auth.rs          # JWT & password hashing
│   └── error.rs         # Error types & responses
├── migrations/          # SQL migrations
├── Dockerfile           # Multi-stage production build
├── docker-compose.yml   # Local development
└── .do/app.yaml         # DigitalOcean deployment config
```

## Deployment

Deployed to DigitalOcean App Platform via GitHub Actions. On push to `main`, CI runs lint, tests, and security scan, then deploys.

## Development

```bash
cargo run              # Run server
cargo test             # Run tests
cargo fmt              # Format code
cargo clippy           # Lint
```
