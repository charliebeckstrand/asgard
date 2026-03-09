# saga

Event bus microservice for asynchronous inter-service messaging.

- **Publish/subscribe** — services publish events and register subscriptions with webhook URLs
- **Persistent storage** — events and subscriptions are stored in PostgreSQL for reliability
- **Webhook delivery** — dispatches events to subscriber endpoints

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
