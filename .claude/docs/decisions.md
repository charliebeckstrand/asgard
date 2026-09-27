# Decisions

Choices Charlie made that the code doesn't explain, with what was turned down. Add to this file when a new one is made. Don't reopen one without a new reason.

## Auth

- **The contract is the user's.** Users own their credentials. Admins manage standing (active or not, roles) and never touch credentials. There are no back doors. Turned down: OPAQUE (a server-wide secret that can be lost) and a device-signed key chain with no recovery.
- **Opaque server-side sessions.** A random token in the `__Host-session` cookie, stored as its SHA-256. Fixed 30-day life, at most 10 per user. No refresh tokens, no device list, no timed sudo window. Every sign-in method ends in one `createSession()`, so SSO (OIDC) can be added later the same way.
- **One-step sign-in, two-step sessions.** Password or OAuth signs in with one step. A passkey counts as both. A session that passes the second step keeps `two_step` for its whole life. Gates are declared once per route group, never inferred from the HTTP method. Other apps show one shared Confirm dialog on `second_step_required`. Charlie turned down a shorter life for admin sessions.
- **Roles are hats, not ranks.** `roles text[]`. New accounts get `user`. `requireSession` covers reads and managing your own account, `requireRole('user')` covers writes, and `requireRole('admin')` also needs the second step. An account with no roles can sign in and read. `is_active = false` turns an account off and ends its sessions.
- **Admins are made from the command line only**, with `node services/bifrost/dist/cli.js promote|demote|reset-mfa <email>` in the App Platform console. Promotion needs a verified email and a second factor. Charlie turned down a migration that promotes a hard-coded email.
- **The owner is emailed when a sign-in method changes.** A password reset sends no extra notice, by design.
- **The breached-password check fails open**, so an outage never blocks a sign-up.

## Data

- **DigitalOcean managed Postgres 18.** Turned down: Neon, PlanetScale Postgres, Turso, Supabase, CockroachDB.
- **Apps bind the standalone cluster, never an app-scoped dev database**, so data outlives the app. App Platform dev databases also can't create schemas.
- **Don't add IP addresses to the cluster's trusted sources.** Doing so once cut the app off from Postgres and took auth.ivoryimage.dev down. For a one-off query, use the bifrost component's console in App Platform.

## Services

- **Vidar stays a separate, private service.** It is not folded into grid and does not run inside bifrost, and it has no public domain. Admins reach it through bifrost's `/api/security` routes and Midgard's admin Security page. Deferred: flagging attacks spread across addresses against one account, and caching ban checks.
- **Apps' data lives in Mimir**, one private service for every app rather than one per app, and not in Midgard. It gets saga migrations, grid's logs and limits, and an OpenAPI spec like the other services. Each app's data is ordinary routes and handlers in Mimir, with no plug-in layer until a second app shows the need. Mimir took over Midgard's `places` database as it was, so the move copied no data. Turned down: a service named for places, a generic documents API (every body `unknown`, validation back in Midgard), and a shared package in Midgard (no saga, grid or spec). Real rows instead of one JSON document per user are a separate, later choice.
- **The rate limiter lives in grid**, not Vidar. `vidar/client` keeps only ban checks, event reports and the admin reads.

## Hosting

- **Everything runs on DigitalOcean App Platform**, in the DO project "Ivory Image". The domain ivoryimage.dev is managed there. Charlie turned down a dedicated egress IP ($25 a month) and merging asgard and midgard into one app.
