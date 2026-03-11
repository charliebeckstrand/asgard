# grid

Shared middleware, proxy, error handling, and schemas.

## createApp

Factory that sets up a fully configured Hono app with the standard middleware stack:

```typescript
import { createApp } from 'grid'

const { app, setup } = createApp({
  basePath: '/api',
  title: 'MyService',
  description: 'Service description',
  cors: { origin: 'http://localhost:3000', credentials: true },
})

// Register routes...

setup()
```

## createBearerAuth

Bearer token authentication middleware wrapping `hono/bearer-auth` with timing-safe comparison:

```typescript
import { createBearerAuth } from 'grid'

// Protect routes with Authorization: Bearer <token>
app.use('/api/*', createBearerAuth(() => process.env.API_KEY))
```

## createProxy

Generic reverse proxy middleware for routing requests to upstream services:

```typescript
import { createProxy } from 'grid'

// Forward all /events/* requests to Huginn
app.all('/events/*', createProxy('http://localhost:3002'))

// With custom timeout
app.all('/vidar/*', createProxy('http://localhost:3003', { timeout: 10_000 }))
```

Preserves method, headers, and body. 
Adds `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` headers. 
Strips hop-by-hop headers.

## createSSEStream

Factory for Server-Sent Events endpoints. Handles EventEmitter subscription, client disconnect cleanup, and keep-alive pings:

```typescript
import { createSSEStream } from 'grid'

app.get(
  '/stream',
  createSSEStream<MyEvent>({
    emitter: eventEmitter,
    mapping: {
      data: (e) => JSON.stringify(e),
      event: (e) => e.type,
      id: (e) => e.id,
    },
    filter: (e, c) => {
      const type = c.req.query('type')
      return !type || e.type === type
    },
  }),
)
```

## Exports

| Export | Type | Description |
| --- | --- | --- |
| `errorHandler` | Middleware | Catches errors and returns JSON responses with status code; falls back to 500 for unhandled exceptions |
| `notFoundHandler` | Middleware | Returns a 404 JSON response with the requested method and path |
| `createOpenApiConfig` | Factory function | Creates an OpenAPI 3.0.0 config object from a `title` and `description` |
| `createHealthRoute` | Factory function | Creates a `GET /health` endpoint with status, version, uptime, and optional custom check |
| `getIpAddress` | Utility function | Extracts the client IP address from a Hono context; returns `'unknown'` as fallback |
| `timingSafeCompare` | Utility function | Constant-time string comparison using `crypto.timingSafeEqual` to prevent timing attacks |
| `ErrorSchema` | Zod schema | Defines `error`, `message`, and `statusCode` fields for error responses |
| `MessageSchema` | Zod schema | Defines a single `message` string field for simple responses |
| `HealthResponseSchema` | Zod schema | Defines `status` (`'healthy'` \| `'degraded'` \| `'unhealthy'`), `version`, and `uptime` fields |
