# norns

Shared server lifecycle utilities for Hono services.

Handles two things:

- **EADDRINUSE recovery** — if a port is occupied by an orphaned process (e.g. after a force kill), automatically kills it and retries
- **Graceful shutdown** — listens for SIGINT/SIGTERM, closes the server, and runs an optional cleanup callback

## Usage

```typescript
import { setupLifecycle } from 'norns'

const server = serve({ fetch: app.fetch, port: env.PORT })

// Without cleanup
setupLifecycle({ server, name: 'Bifrost', port: env.PORT })

// With cleanup (e.g. closing a database pool)
setupLifecycle({ server, name: 'Saga', port: env.PORT, onShutdown: closePool })
```
