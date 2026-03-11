# grid

Shared Hono middleware, authentication, proxy, SSE streaming, error handling, and schemas.

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

setup() // Finalizes OpenAPI docs, error handlers, etc.
```

### Middleware stack (applied automatically)

1. Trailing slash normalization (`hono/trailing-slash`)
2. CORS (`hono/cors`)
3. Secure headers (`hono/secure-headers`)
4. Request logging (`hono/logger`)
5. Server-Timing headers (`hono/timing`)
6. Compression (`hono/compress`)
7. ETag caching (`hono/etag`)

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

## Other exports

```typescript
import {
  errorHandler,
  notFoundHandler,
  createOpenApiConfig,
  createHealthRoute,
  getIpAddress,
  timingSafeCompare,
  ErrorSchema,
  MessageSchema,
  HealthResponseSchema,
} from 'grid'
```
