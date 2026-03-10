# bifrost

API gateway and Backend-for-Frontend (BFF).

## Routes

| Prefix | Path | Description |
| ------ | ---------------- | --------------------------------- |
| /auth | `/login` | Login and set session |
| /auth | `/register` | Register a new account |
| /auth | `/logout` | Clear session |
| /auth | `/session` | Check session status |
| /api | `/health` | Health check |
| /api | `/users` | Guarded user management |
| /api | `/docs` | Swagger UI |
| /api | `/openapi.json` | OpenAPI spec |

## Proxy

Bifrost proxies requests to downstream services via Grid's `createProxy()`:

| Pattern | Upstream |
| ----------- | -------------------------------- |
| `/events/*` | Huginn (`HUGINN_URL`, port 3002) |
| `/vidar/*` | Vidar (`VIDAR_URL`, port 3003) |

## Security

- **CSRF protection**: `hono/csrf` validates `Origin` header on mutating requests (POST/PUT/DELETE/PATCH)
- **Session cookies**: `SameSite: Lax`, encrypted with `SESSION_SECRET`
- **Rate limiting**: Configurable per-route rate limits on `/auth/*` via Heimdall
- **Ban enforcement**: Vidar IP ban checks on `/auth/*` routes

## Environment

| Variable | Required | Description |
| ---------------- | -------- | ---------------------------------- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECRET_KEY` | Yes | JWT signing key (min 32 chars) |
| `SESSION_SECRET` | No | Cookie encryption key (min 32 chars) |
| `CORS_ORIGIN` | No | Allowed origin (default: `http://localhost:3000`) |
| `HUGINN_URL` | No | Huginn base URL (default: `http://localhost:3002`) |
| `VIDAR_URL` | No | Vidar base URL |
| `VIDAR_API_KEY` | No | Bearer token for Vidar API |
