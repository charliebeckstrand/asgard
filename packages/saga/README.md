# saga

PostgreSQL logging and search.

## Usage

```ts
import { createBatch, createLog, queryLogs } from 'saga'
```

### Use service functions directly

```ts
import { createLog, queryLogs } from 'saga'

await createLog(db, {
	type: 'server',
	level: 'info',
	service: 'bifrost',
	message: 'Request received',
	metadata: {},
})

const logs = await queryLogs(db, {
	limit: 50,
	offset: 0,
	service: 'bifrost',
})
```

### Use exported schemas in your own routes

```ts
import { CreateLogSchema, LogQuerySchema } from 'saga'

// Reuse Saga schemas when defining your service's own HTTP routes.
```

