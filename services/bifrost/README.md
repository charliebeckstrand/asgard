# bifrost

API gateway and Backend-for-Frontend (BFF).

- **Auth** — registration, login, token refresh, and session management via the `heimdall` package
- **Session management** — cookie-based sessions wrapping JWTs with automatic token refresh
- **IP ban enforcement** — integrates with Vidar to block banned IPs on auth routes
- **Client generation** — generates TypeScript types from downstream OpenAPI specs via `pnpm generate:client`

## Routes

| Prefix | Path | Description |
| ------ | ---------------- | ---------------------- |
| /auth | `/login` | Login and set session |
| /auth | `/register` | Register a new account |
| /auth | `/logout` | Clear session |
| /auth | `/session` | Check session status |
| /api | `/health` | Health check |
| /api | `/users` | User listing |
| /api | `/docs` | Swagger UI |
| /api | `/openapi.json` | OpenAPI spec |
