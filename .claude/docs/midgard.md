# Midgard

[charliebeckstrand/midgard](https://github.com/charliebeckstrand/midgard) is the frontend: Next.js apps (admin, places, docs) and the `auth`, `shared` and `ui` packages. It is deployed as one App Platform app, `midgard`, serving admin., places. and docs.ivoryimage.dev. Bifrost serves auth.ivoryimage.dev.

This file is the one record of how the two repos fit together. Midgard links here instead of keeping its own copy. Change it in the same pull request as the change to the contract.

## Requests

- Midgard's servers proxy `/auth/*` and `/api/*` to `BIFROST_URL` (https://auth.ivoryimage.dev in production, http://localhost:4000 elsewhere). Midgard needs `BIFROST_URL` at build time and at run time.
- Each app keeps its own `__Host-session` cookie, since `__Host-` cookies have no Domain. Bifrost's `APP_ORIGINS` lists the apps allowed to call it.

## Client address

App Platform overwrites `do-connecting-ip` on every hop, so requests from Midgard carry Midgard's address. Midgard's proxy sends the browser's address in `x-client-ip` together with `x-client-ip-secret`. Bifrost trusts `x-client-ip` only when the secret matches `CLIENT_IP_SECRET`. The same value is a repository secret in both repos and is required in production: bifrost won't start without it, and Midgard's proxy answers 500.

## Types

Bifrost's OpenAPI spec is committed at `services/bifrost/openapi.json`. Midgard generates `packages/auth/src/openapi.d.ts` from asgard's `main` and calls bifrost through an openapi-fetch client. After a bifrost API change:

1. In asgard, run `pnpm --filter bifrost openapi` and merge.
2. In midgard, run `pnpm --filter auth openapi`.

## Second step

When bifrost answers `second_step_required`, Midgard shows its one shared Confirm dialog and retries. The whole admin app needs a two-step session, verified once on entry at `/verify`.

## Deploy order

A change that spans both repos usually merges in asgard first, so Midgard never calls a route that isn't live yet.
