# heimdall

JWT authentication and user management.

Mountable Hono app or individual service functions — with optional [Vidar](services/vidar) integration.

## Usage

```typescript
import { configure, authenticateUser, verifyAccessToken, refreshTokenPair } from 'heimdall'
import { createLazyPool } from 'mimir'

// Configure once at startup
const { getPool, closePool } = createLazyPool(() => process.env.DATABASE_URL, { max: 5 })

configure({
  getPool,
  secretKey: process.env.SECRET_KEY,
  vidarUrl: process.env.VIDAR_URL,
  vidarApiKey: process.env.VIDAR_API_KEY,
})

// Use service functions directly
const tokens = await authenticateUser('user@example.com', 'password', '127.0.0.1')
const user = await verifyAccessToken(tokens.access_token)
const newTokens = await refreshTokenPair(tokens.refresh_token)
```

### Standalone app

```typescript
import { createAuthApp } from 'heimdall'

const authApp = createAuthApp({ getPool, secretKey: '...' })

// Mount under /auth in your Hono app
app.route('/auth', authApp)
```
