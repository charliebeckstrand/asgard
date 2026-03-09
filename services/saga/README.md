# saga

Centralized logging service for structured log ingestion and querying.

- **Structured logging** — services send typed log entries with metadata
- **Persistent storage** — logs are stored in PostgreSQL for querying
- **Search API** — filter logs by service, level, type, and time range
- **Event bus integration** — subscribes to Huginn for event-driven log ingestion

## Routes

All routes are prefixed with `/logs`.

| Method | Path | Description |
| ------ | --------------- | ----------------------- |
| GET | `/` | List and filter logs |
| POST | `/` | Create a single log |
| POST | `/batch` | Create multiple logs |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
