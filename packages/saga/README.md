# saga

PostgreSQL logging and search for Hono services. 

Store structured log entries, query by service, level, type, and time range, and mount a full OpenAPI-documented router directly into any Hono app.

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
