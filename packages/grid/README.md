# grid

Shared Hono service utilities — middleware, error handling, schemas, and OpenAPI config.

Eliminates boilerplate that every service would otherwise duplicate.

## Usage

```typescript
import {
  requestLogger,
  errorHandler,
  notFoundHandler,
  createOpenApiConfig,
  ErrorSchema,
  MessageSchema,
} from 'grid'

// Request logging middleware
app.use('*', requestLogger())

// Shared error handlers
app.onError(errorHandler)
app.notFound(notFoundHandler)

// OpenAPI config (reads port from manifest.json)
const openApiConfig = createOpenApiConfig({
  title: 'Saga',
  description: 'Centralized logging service',
})

app.doc('/logs/openapi.json', openApiConfig)
```
