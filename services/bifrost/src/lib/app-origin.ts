import type { Context } from 'hono'
import { environment } from './env.js'

/**
 * The app origin that the request came through, from the forwarded host. Only
 * an origin in `CORS_ORIGIN` counts, so a redirect or an emailed link always
 * goes to one of the apps.
 */
export function appOrigin(c: Context): string | undefined {
	const host = c.req.header('x-forwarded-host') ?? c.req.header('host')

	return environment().CORS_ORIGIN.find((origin) => new URL(origin).host === host)
}
