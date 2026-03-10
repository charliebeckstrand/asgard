# heimdall

JWT auth guard.

Service-layer auth primitives for Bifrost and other services, with optional Vidar integration.

## Usage

```typescript
import { configure, authenticateUser, registerUser, verifyAccessToken, refreshTokenPair } from 'heimdall'
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
const createdUser = await registerUser('user@example.com', 'password', '127.0.0.1')
const user = await verifyAccessToken(tokens.access_token)
const newTokens = await refreshTokenPair(tokens.refresh_token)
```
