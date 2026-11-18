# Midgard

[charliebeckstrand/midgard](https://github.com/charliebeckstrand/midgard) is the frontend: Next.js apps (admin, places, picks, elections, numbers, docs) and the `auth`, `shared` and `ui` packages. It is deployed as one App Platform app, `midgard`, serving admin., places., elections., numbers. and docs.ivoryimage.dev. The picks app does not deploy yet: midgard's `.do/app.yaml` has no picks component. The elections app is public and reads civicAPI from its own server, so it never calls bifrost and needs no entry in `APP_ORIGINS`. Bifrost serves auth.ivoryimage.dev.

This file is the one record of how the two repos fit together. Midgard links here instead of keeping its own copy. Change it in the same pull request as the change to the contract.

## Requests

- Midgard's servers proxy `/auth/*` and `/api/*` to `BIFROST_URL` (https://auth.ivoryimage.dev in production, http://localhost:4000 elsewhere). Midgard needs `BIFROST_URL` at build time and at run time.
- Bifrost forwards `/api/places/*`, `/api/visits/*`, `/api/trips/*`, `/api/photos/*`, `/api/predictions/*` and `/api/games/*` to Mimir, which keeps the places app's data, the picks app's NFL picks and the numbers app's results. Neither app has a database of its own for them; each turns on `gatewayApi` so those paths reach bifrost. Mimir doesn't read the NFL schedule, so the picks app checks which games can still take a pick before it saves. A pick is the picked team and the point spread of that team when the pick was saved, or `null` when no line was out yet. The picks app sets the line from the scoreboard when it saves. Mimir sends `cache-control: private, no-store` on all of them.
- Bifrost emails each link on the origin of the app that asked for it: `/verify-email?token=…` and `/reset-password?token=…`. Each Midgard app with sign-in serves both paths, takes `token` out of the address before the page hydrates (`shared/link-secrets`), and sends it only in the body of the confirm call. A new secret param of a link goes in that list too.
- Each app keeps its own `__Host-session` cookie, since `__Host-` cookies have no Domain. Bifrost's `APP_ORIGINS` lists the apps allowed to call it.
- Midgard reads `GET /auth/oauth/providers` and `GET /auth/register/options` with no cookies and caches each answer for hours, so the sign-in and register pages can prerender. Both routes must answer the same to every caller.

## Trips

- `GET /api/trips` lists the user's trips, newest `startsOn` first. `POST /api/trips` takes a `NewTrip`, a trip with optional `stops`, and answers `{ trip, places }`: the trip and the places its stops added or changed. A stop is a visit to a stored place (`{ placeId, visit }`; a visit with the `id` of one of that place's visits replaces it) or a new place with one visit (`{ place }`). Mimir sets `tripId` on each stop's visit, all in one change. `PUT /api/trips/{id}` takes a `TripDraft` and keeps the trip's visits. `DELETE /api/trips/{id}` clears `tripId` on its visits and keeps them.
- A visit's `tripId` must name one of the user's trips, and `visitedAt` must fall within its days, or `POST` and `PUT /api/places` answer 400 with `code: "visit-outside-trip"`, as does a stop outside its new trip. `PUT /api/trips/{id}` answers 409 with `code: "trip-days-exclude-visits"` when the new days would leave out one of its visits.

## Numbers

- `/api/games/*` holds the routes of each game under its name, today only `/api/games/numbers/*`.
- Sign-in is optional in the numbers app, and only a signed-in reader has stats. The app calls `/api/games/numbers/*` only with a session, because the query client sends a 401 to `/login`. The one exception is `GET /api/games/numbers/daily`, which needs no session.
- `GET /api/games/numbers/stats` answers `NumbersStats`: for `solo` and `vsCpu`, the runs played, the wins, the best and the mean score (`null` with no runs), and the count of runs that ended on each score from 0 to 20. `winRate` is, for `vsCpu`, the share from 0 to 1 of the runs that beat the CPU, of the runs that came with `beatCpu`, or `null` before the first one; it is always `null` for `solo`. The app shows it as Win % on the Vs CPU tab of Stats.
- `POST /api/games/numbers/results` takes `{ seed, score, mode, today, beatCpu }` for each finished run (a bust, a win, or a reset after the first placement) and answers the new `NumbersStats`. Every run counts, replays included. Each run counts on one leaderboard of `today`: a solo run on `solo`, and a run with `beatCpu: true`, which ended with more slots filled than the CPU, on `vsCpu`. A vs CPU run that tied or lost, or that has no `beatCpu`, counts on no board, but it counts in the stats. Solo runs leave out `beatCpu`. It needs the user role and a verified email, so the app sends it only for a verified user.
- `today` is the reader's date. Mimir answers 400 when it is more than one day from the server's date, so a reader can't count a run on the board of another day. Mimir trusts the score: it can't replay a run.
- `GET /api/games/numbers/daily?date=YYYYMMDD&mode=solo` answers `NumbersBoard`, the leaderboard `mode` (`solo` or `vsCpu`) of the day `date`: `players`, the count of players on that board, and `entries`, the top 10 by their best score on it, then the reader's own entry when it is below them. A reader with no session gets the top 10, with no entry of their own, and `you` is `false` on each. Each entry has `rank`, `name` (the name of the player's account, or `null` for an account with no name), `score` and `you`. Equal scores share a rank and list in the order that the players got them. Mimir answers 400 when `date` is more than one day ahead of the server's date. Earlier dates keep their boards.
- A board shows each player by the name of their account (`users.name`), which bifrost sends to Mimir with the user and each counted run keeps. An account with no name, such as one made with GitHub or Google, has `name: null`, which the app shows as anonymous. Every signed-in player of a board is on it, with or without a name. The boards are public, so a name on a board is public too. Mimir can't stop a false score, because the app makes the deck from the seed, so a reader can know each number before it is drawn.

## Photos

- Photos live in a private DigitalOcean Spaces bucket. To add one, call `POST /api/photos/uploads` with `{ contentType, size }` (JPEG, PNG or WebP, at most 15 MB). It answers `{ key, uploadUrl }`. PUT the file to `uploadUrl` within five minutes, with the same `content-type` and exactly `size` bytes, then send `key` in the visit's or trip's `photos`. The save keeps the photo under a new key and answers with it; an upload no save keeps within a day is deleted.
- Drafts send keys. Reads answer each photo as `{ key, url, originalUrl }`. `url` reads the photo's view: a WebP at most 2048 px on its long side, turned upright, which the save writes beside the photo. Show `url`, because a browser that paints large originals again on each frame drops frames. `originalUrl` reads the photo as it was uploaded. A photo saved before views, until the deploy moves it, and a photo kept as a web address answer their original in both. Each is a presigned GET that works for at least 45 minutes and stays the same for a quarter hour, so the browser caches it. A key outside the user's own is refused with 400 and `code: "photo-not-yours"`.
- A draft's `photos` are upload keys (`uploads/…`) for new photos and stored keys (`users/…`, the `key` a read answered with) for kept ones. The save also accepts an upload key it already kept, for a day, and the key a photo had before the deploy moved it to a key with a view. Any other key answers 409 with `code: "photo-missing"` and the message "A photo is no longer available. Remove it and save again.", as when the upload never finished, or a draft kept a photo deleted since it was opened.
- A write that drops a key deletes the photo, and so does deleting a trip, visit, place or account.
- The bucket's CORS allows PUT and GET from https://places.ivoryimage.dev and http://localhost:3001, with the `content-type` header. It is set in the Spaces dashboard, not in this repo.
- A lifecycle rule deletes objects under `uploads/` a day after they are written. Spaces sets lifecycle rules only through the S3 API, once per bucket: `aws s3api put-bucket-lifecycle-configuration --endpoint-url "$SPACES_ENDPOINT" --bucket "$SPACES_BUCKET" --lifecycle-configuration '{"Rules":[{"ID":"expire-uploads","Status":"Enabled","Filter":{"Prefix":"uploads/"},"Expiration":{"Days":1}}]}'`.
- Visits saved before uploads kept photos as web addresses. The deploy copies them into the bucket. Until it has, such a photo reads as `{ key, url }` with the address in both, and sending it back is refused, so Midgard should drop it from a draft rather than send it.

## Client address

App Platform overwrites `do-connecting-ip` on every hop, so requests from Midgard carry Midgard's address. Midgard's proxy sends the browser's address in `x-client-ip` together with `x-client-ip-secret`. Bifrost trusts `x-client-ip` only when the secret matches `CLIENT_IP_SECRET`. The same value is a repository secret in both repos and is required in production: bifrost won't start without it, and Midgard's proxy answers 500.

## Types

Bifrost's OpenAPI spec is committed at `services/bifrost/openapi.json`, and Mimir's at `services/mimir/openapi.json`. Midgard generates `packages/auth/src/openapi.d.ts` from bifrost's and `packages/shared/src/mimir/openapi.d.ts` from Mimir's, both from asgard's `main`, and calls each through an openapi-fetch client. The places, picks and numbers apps import Mimir's types from that one file (`shared/mimir`), so they can't drift apart. After an API change:

1. In asgard, run `pnpm --filter bifrost openapi` or `pnpm --filter mimir openapi` and merge.
2. In midgard, run `pnpm --filter auth openapi` or `pnpm --filter shared openapi`.

## Second step

When bifrost answers `second_step_required`, Midgard shows its one shared Confirm dialog and retries. The whole admin app needs a two-step session, verified once on `/login` right after sign-in. The page shows the second step in place of the sign-in form and starts the passkey check at once.

## Deploy order

A change that spans both repos merges in asgard first, and Midgard merges after asgard deploys, so Midgard never calls a route that isn't live yet.
