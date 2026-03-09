# saga

Structured log ingestion and querying package.

- **Typed entries** — structured log entries with metadata
- **Persistent storage** — logs stored in PostgreSQL
- **Search API** — filter logs by service, level, type, and time range
- **Mountable routes** — Hono router factory for embedding in any service

## Usage

```ts
import { createLogsApp, createLog, queryLogs } from 'saga'
```

### Mount the full app (with OpenAPI docs)

```ts
import { createLogsApp } from 'saga'

const logsApp = createLogsApp(pool)
app.route('/', logsApp)
```

### Mount just the router

```ts
import { createLogsRouter } from 'saga'

app.route('/logs', createLogsRouter(pool))
```

### Use service functions directly

```ts
import { createLog, createBatch, queryLogs } from 'saga'

await createLog(pool, { level: 'info', service: 'bifrost', message: 'Request received', type: 'server', metadata: {} })
await queryLogs(pool, { limit: 50, offset: 0, service: 'bifrost' })
```
