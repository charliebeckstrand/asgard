# huginn

Event bus microservice for asynchronous inter-service messaging.

## Routes

All routes are prefixed with `/events`.

| Method | Path | Auth | Description |
| ------ | ------------------- | ---- | ----------------------------------- |
| POST | `/publish` | Yes | Publish an event |
| GET | `/subscriptions` | Yes | List subscriptions |
| POST | `/subscriptions` | Yes | Create a subscription |
| DELETE | `/subscriptions/:id` | Yes | Delete a subscription |
| GET | `/stream` | Yes | SSE event stream |
| GET | `/health` | No | Health check |
| GET | `/docs` | No | Swagger UI |
| GET | `/openapi.json` | No | OpenAPI spec |

## SSE Streaming

`GET /events/stream` provides a real-time Server-Sent Events feed of published events:

```bash
curl -N -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3002/events/stream?topic=user.registered"
```

- Optional `?topic=` query parameter to filter by event topic
- Events are emitted after DB insert, before webhook delivery
- 30-second keep-alive pings
- Automatic cleanup on client disconnect

## Authentication

Protected routes require `Authorization: Bearer <token>` header. The token is configured via `HUGINN_API_KEY`.

## Event Delivery

When an event is published:

1. Event is stored in `huginn.events` table
2. Event is emitted to connected SSE clients
3. Active subscriptions are queried for matching topic
4. Webhook callbacks are delivered to each subscriber
5. Failed deliveries retry up to 3 times with exponential backoff
