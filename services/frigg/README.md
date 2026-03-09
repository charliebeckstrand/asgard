# frigg

Config oracle — validates service environments and manages secrets across the monorepo.

- **Environment validation** — loads and validates each service's `manifest.json` against its environment variables
- **Secrets management** — exposes secret metadata for rotation and auditing
- **Fail-fast startup** — reports loaded service count on boot and halts if configs are invalid

## Routes

All routes are prefixed with `/services`.

| Method | Path | Description |
| ------ | -------------- | -------------------------------- |
| POST | `/validate` | Validate a service's environment |
| GET | `/secrets` | List secret metadata |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
