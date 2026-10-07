# Midgard

[charliebeckstrand/midgard](https://github.com/charliebeckstrand/midgard) is the frontend: Next.js apps (admin, places, picks, docs) and the `auth`, `shared` and `ui` packages. It is deployed as one App Platform app, `midgard`, serving admin., places., picks. and docs.ivoryimage.dev. Bifrost serves auth.ivoryimage.dev.

This file is the one record of how the two repos fit together. Midgard links here instead of keeping its own copy. Change it in the same pull request as the change to the contract.

## Requests

- Midgard's servers proxy `/auth/*` and `/api/*` to `BIFROST_URL` (https://auth.ivoryimage.dev in production, http://localhost:4000 elsewhere). Midgard needs `BIFROST_URL` at build time and at run time.
- Bifrost forwards `/api/places/*`, `/api/visits/*` and `/api/predictions/*` to Mimir, which keeps the places app's data and the picks app's NFL picks. Neither app has a database of its own for them; each turns on `gatewayApi` so those paths reach bifrost. Mimir doesn't read the NFL schedule, so the picks app checks which games can still take a pick before it saves. A pick is the picked team and the point spread of that team when the pick was saved, or `null` when no line was out yet. The picks app sets the line from the scoreboard when it saves. Mimir sends `cache-control: private, no-store` on all of them.
- Each app keeps its own `__Host-session` cookie, since `__Host-` cookies have no Domain. Bifrost's `APP_ORIGINS` lists the apps allowed to call it.
- Midgard reads `GET /auth/oauth/providers` and `GET /auth/register/options` with no cookies and caches each answer for hours, so the sign-in and register pages can prerender. Both routes must answer the same to every caller.

## Client address

App Platform overwrites `do-connecting-ip` on every hop, so requests from Midgard carry Midgard's address. Midgard's proxy sends the browser's address in `x-client-ip` together with `x-client-ip-secret`. Bifrost trusts `x-client-ip` only when the secret matches `CLIENT_IP_SECRET`. The same value is a repository secret in both repos and is required in production: bifrost won't start without it, and Midgard's proxy answers 500.

## Types

Bifrost's OpenAPI spec is committed at `services/bifrost/openapi.json`, and Mimir's at `services/mimir/openapi.json`. Midgard generates `packages/auth/src/openapi.d.ts` from bifrost's and `packages/shared/src/mimir/openapi.d.ts` from Mimir's, both from asgard's `main`, and calls each through an openapi-fetch client. The places and picks apps both import Mimir's types from that one file (`shared/mimir`), so they can't drift apart. After an API change:

1. In asgard, run `pnpm --filter bifrost openapi` or `pnpm --filter mimir openapi` and merge.
2. In midgard, run `pnpm --filter auth openapi` or `pnpm --filter shared openapi`.

## Second step

When bifrost answers `second_step_required`, Midgard shows its one shared Confirm dialog and retries. The whole admin app needs a two-step session, verified once on entry at `/verify`.

## Deploy order

A change that spans both repos usually merges in asgard first, so Midgard never calls a route that isn't live yet.
