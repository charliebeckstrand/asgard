# bifrost

API gateway and Backend-for-Frontend (BFF).

## Routes

| Prefix | Path | Description |
| ------ | ---------------- | ---------------------- |
| /auth | `/login` | Login and set session |
| /auth | `/register` | Register a new account |
| /auth | `/logout` | Clear session |
| /auth | `/session` | Check session status |
| /api | `/health` | Health check |
| /api | `/users` | User listing |
| /api | `/docs` | Swagger UI |
| /api | `/openapi.json` | OpenAPI spec |
