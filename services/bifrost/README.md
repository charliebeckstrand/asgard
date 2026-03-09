# bifrost

API gateway and Backend-for-Frontend (BFF) bridging frontend clients to internal services.

- **Session management** — cookie-based sessions wrapping Heimdall JWTs
- **Auth proxy** — login, register, logout, and user routes that delegate to Heimdall
- **Client generation** — generates TypeScript types from downstream OpenAPI specs via `pnpm generate:client`

## Routes

| Prefix | Path | Description |
| ------ | -------------- | ---------------------- |
| /auth | `/login` | Proxy login to Heimdall |
| /auth | `/register` | Proxy registration |
| /auth | `/logout` | Clear session |
| /api | `/users/me` | Get current user |
| /api | `/health` | Health check |
| /api | `/docs` | Swagger UI |
| /api | `/openapi.json` | OpenAPI spec |
