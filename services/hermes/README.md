# hermes

Stateless multi-channel messaging relay with real-time WebSocket streaming.

- **WebSocket channels** — clients connect via `/messages/ws` and join named channels
- **HTTP send & broadcast** — push messages to specific channels or broadcast to all connected clients
- **Stateless** — no database, no environment config required

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
