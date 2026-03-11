# norns

## Usage

```typescript
import { setupLifecycle } from 'norns'

const server = serve({ fetch: app.fetch, port: env.PORT })

// Without cleanup
setupLifecycle({ server, name: 'Bifrost', port: env.PORT })

// With cleanup (e.g. closing a database pool)
setupLifecycle({ server, name: 'Huginn', port: env.PORT, onShutdown: closePool })
```
