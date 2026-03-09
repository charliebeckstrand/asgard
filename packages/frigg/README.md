# frigg


Reads `manifest.json` from each service, generates cryptographic secrets, resolves cross-service references, and writes `.env` files.

## Usage

```bash
pnpm env:init          # Generate secrets and write .env files
pnpm env:rotate        # Rotate all secrets
```

```typescript
import { loadManifests, generateSecrets, resolveEnvironments, validateAll } from 'frigg'

const manifests = loadManifests('./services')
const cache = generateSecrets(manifests, {})
const environments = resolveEnvironments(manifests, cache)
const results = validateAll(environments, manifests)
```
