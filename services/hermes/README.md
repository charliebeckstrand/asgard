# hermes

Stateless multi-channel messaging relay with real-time WebSocket streaming.

## Routes

All routes are prefixed with `/messages`.

| Method | Path | Description |
| ------ | -------------- | ---------------------- |
| WS | `/ws` | WebSocket connection |
| POST | `/send` | Send to a channel |
| POST | `/broadcast` | Broadcast to all |
| GET | `/channels` | List active channels |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI spec |
