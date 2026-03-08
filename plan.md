# Frigg Simplification: The Config Oracle

## Identity
Frigg becomes **"The All-Mother's Oracle"** — a lightweight, DB-free config distribution and validation service. She reads environment files from disk, distributes configs to services via API, and validates the entire system's configuration for correctness and consistency.

## Structural Changes

### New `environments/` folder (replaces `environments.json`)
- `environments/development.json` — committed to repo
- `environments/production.json` — gitignored (same structure, production values)
- Keys are just service names (no `.environment` suffix since the file determines the environment):
```json
{
  "$defaults": { "NODE_ENV": "development" },
  "bifrost": { "PORT": "3000", ... },
  "heimdall": { "PORT": "8000", ... }
}
```

### Files to DELETE from Frigg
- `migrations/` folder (no more DB)
- `src/lib/db.ts` (PostgreSQL pool)
- `src/lib/crypto.ts` (AES encryption — not needed without DB storage)
- `src/services/config.ts` (DB query layer)
- `src/seed.ts` (DB seeding script)
- `src/__tests__/crypto.test.ts`

### Files to CREATE
- `environments/development.json` — reformatted from current `environments.json`
- `src/lib/environments.ts` — loads and caches the environment JSON file
- `src/routes/validate.ts` — validation oracle endpoints
- `src/__tests__/validate.test.ts` — validation tests

### Files to MODIFY
- `package.json` — remove `mimir` dependency, remove `seed` script, update description
- `src/lib/env.ts` — remove DATABASE_URL, FRIGG_SECRET_KEY (no longer needed)
- `src/lib/schemas.ts` — remove history/rollback/delete schemas, add validation schemas
- `src/lib/openapi.ts` — update service description
- `src/app.ts` — add validate route, remove config write routes
- `src/routes/config.ts` — simplify to read-only (GET only, reads from file)
- `src/client.ts` — namespace is just service name now
- `src/__tests__/config.test.ts` — rewrite for new API
- `.env.example` — update

### Root-level changes
- Delete `environments.json` (replaced by `environments/` folder)
- Update `scripts/env-init.mjs` — read from `environments/development.json`
- Update `.gitignore` — add `environments/production.json`

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/frigg/health` | No | Health check |
| GET | `/frigg/environment/:service` | Yes | Get config for a service (merged with $defaults) |
| GET | `/frigg/validate` | Yes | Validate ALL services' configs |
| GET | `/frigg/validate/:service` | Yes | Validate a specific service's config |
| GET | `/frigg/docs` | No | Swagger UI |

## Validation Oracle Features
Frigg inspects the environment config and reports:
1. **Missing values** — empty or absent required-looking vars
2. **Port conflicts** — duplicate PORT values across services
3. **Invalid URLs** — URL-shaped keys with malformed values
4. **Cross-service consistency** — e.g., bifrost's `HEIMDALL_API_KEY` matches heimdall's `HEIMDALL_API_KEY`
5. **Service reference checks** — if a service references another service's URL, verify that service exists and the port matches
6. Per-service and system-wide validation summaries with pass/warn/fail status

## Implementation Order
1. Create `environments/` folder structure, migrate data from `environments.json`
2. Delete DB-related files from Frigg
3. Rewrite core Frigg (env.ts, environments.ts, schemas.ts, config route)
4. Add validation oracle (validate route + service logic)
5. Update app.ts, index.ts, client.ts, openapi.ts
6. Rewrite tests
7. Update root-level files (env-init.mjs, .gitignore, delete environments.json)
8. Update Frigg's environments entry (remove DB/crypto vars from its own config)
