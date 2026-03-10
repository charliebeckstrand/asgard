# vidar

Security monitoring microservice for threat detection, IP ban enforcement, and rule-based analysis.

## Routes

All routes are prefixed with `/vidar`.

| Method | Path | Auth | Description |
| ------ | -------------- | ---- | ------------------------- |
| POST | `/events` | Yes | Ingest a security event |
| POST | `/analyze` | Yes | Analyze a request |
| GET | `/check-ip` | Yes | Check if an IP is banned |
| GET | `/bans` | Yes | List active bans |
| POST | `/bans` | Yes | Create a ban |
| DELETE | `/bans/:id` | Yes | Remove a ban |
| GET | `/threats` | Yes | List threats |
| GET | `/rules` | Yes | List detection rules |
| GET | `/stream` | Yes | SSE security alert stream |
| GET | `/health` | No | Health check |
| GET | `/docs` | No | Swagger UI |
| GET | `/openapi.json` | No | OpenAPI spec |

## SSE Streaming

`GET /vidar/stream` provides a real-time Server-Sent Events feed of security events:

```bash
curl -N -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3003/vidar/stream?event_type=login_failed"
```

- Optional `?event_type=` query parameter to filter by event type
- Events are emitted after DB insert, before rule evaluation
- 30-second keep-alive pings
- Automatic cleanup on client disconnect

## Authentication

Protected routes require `Authorization: Bearer <token>` header. The token is configured via `VIDAR_API_KEY`.

## RPC Client

Vidar exports a typed RPC client via `vidar/client` for use by other services:

```typescript
import { configure, checkBan, reportEvent } from 'vidar/client'

configure({ vidarUrl: 'http://localhost:3003', vidarApiKey: 'secret' })

// Middleware: check if IP is banned
app.use('/auth/*', checkBan())

// Fire-and-forget: report security events
reportEvent('login_failed', '192.168.1.1', { email: 'user@test.com' })
```

The client uses Hono's `hc` for type-safe HTTP calls derived from Vidar's route types.
