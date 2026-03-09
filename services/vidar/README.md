# vidar

Security monitoring microservice for threat detection, IP ban enforcement, and rule-based analysis.

- **Threat tracking** — logs and queries security threats with severity levels
- **IP bans** — check, create, and manage IP bans consumed by other services
- **Rules engine** — configurable detection rules for automated threat analysis
- **Event integration** — publishes security events to Saga for downstream consumers

## Routes

All routes are prefixed with `/vidar`.

| Method | Path | Description |
| ------ | -------------- | ---------------------- |
| POST | `/analyze` | Analyze a request |
| GET | `/check-ip` | Check if an IP is banned |
| GET | `/bans` | List active bans |
| POST | `/bans` | Create a ban |
| GET | `/threats` | List threats |
| GET | `/rules` | List detection rules |
| POST | `/rules` | Create a detection rule |
| GET | `/events` | List security events |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
