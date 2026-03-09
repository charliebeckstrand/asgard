# heimdall

JWT authentication microservice for user registration, login, and token management.

Handles the full auth lifecycle:

- **Registration & login** — password hashing with Argon2, JWT access + refresh tokens
- **Token refresh** — rotating refresh tokens with configurable expiry
- **Token verification** — validates JWTs for downstream services
- **IP ban enforcement** — integrates with Vidar to block banned IPs at the middleware level

## Routes

All routes are prefixed with `/auth`.

| Method | Path | Description |
| ------ | -------------- | ---------------------- |
| POST | `/register` | Register a new user |
| POST | `/login` | Authenticate and login |
| POST | `/refresh` | Refresh access token |
| POST | `/verify` | Verify a JWT |
| GET | `/me` | Get current user |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
