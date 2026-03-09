# huginn

Event bus microservice for asynchronous inter-service messaging.

## Routes

All routes are prefixed with `/events`.

| Method | Path | Description |
| ------ | ---------------- | --------------------- |
| POST | `/publish` | Publish an event |
| GET | `/subscriptions` | List subscriptions |
| POST | `/subscriptions` | Create a subscription |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
