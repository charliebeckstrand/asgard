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
| POST | `/ingest` | Ingest a single log |
| POST | `/ingest/batch` | Ingest multiple logs |
| GET | `/search` | Search and filter logs |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
