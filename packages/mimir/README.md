# mimir

Shared PostgreSQL connection pool for services that need database access.

Decomposes `DATABASE_URL` into individual connection parameters to work around DigitalOcean managed Postgres SSL issues (`SELF_SIGNED_CERT_IN_CHAIN`).

## Usage

```typescript
import { createPool, closePool } from 'mimir'

const pool = createPool(process.env.DATABASE_URL)

// Query
const result = await pool.query('SELECT * FROM users')

// Cleanup on shutdown
await closePool(pool)
```
