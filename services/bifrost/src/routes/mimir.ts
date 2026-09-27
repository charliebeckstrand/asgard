import { HTTPException } from 'grid'
import { type Context, Hono } from 'hono'
import { environment } from '../lib/env.js'
import { logger } from '../lib/log.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

// Apps' data lives in Mimir, which stays off the internet. Bifrost checks the
// session and forwards the request unchanged, with its user and Mimir's API
// key. Mimir declares which routes need which role, and its own spec
// (services/mimir/openapi.json) describes these paths.

const unavailable = () => new HTTPException(503, { message: 'App data is unavailable' })

// Only what a JSON API needs. Cookies stay here.
const RESPONSE_HEADERS = ['content-type', 'cache-control']

async function forward(c: Context<SessionEnv>): Promise<Response> {
	const { user } = requireSession(c)

	const { MIMIR_URL, MIMIR_API_KEY } = environment()

	if (!MIMIR_URL || !MIMIR_API_KEY) throw unavailable()

	const { pathname, search } = new URL(c.req.url)

	const method = c.req.method

	const headers: Record<string, string> = {
		authorization: `Bearer ${MIMIR_API_KEY}`,
		'x-mimir-user': JSON.stringify({
			id: user.id,
			roles: user.roles,
			is_verified: user.is_verified,
		}),
	}

	const contentType = c.req.header('content-type')

	if (contentType) headers['content-type'] = contentType

	let res: Response

	try {
		res = await fetch(`${MIMIR_URL}${pathname}${search}`, {
			method,
			headers,
			body: method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
			signal: AbortSignal.timeout(10_000),
		})
	} catch (err) {
		logger().error({ err, path: pathname }, 'mimir unreachable')

		throw unavailable()
	}

	// Bifrost always sends a user and the key, so a 401 means the key is wrong.
	if (res.status === 401 || res.status >= 500) {
		logger().error({ status: res.status, path: pathname }, 'mimir failed')

		throw unavailable()
	}

	const forwarded = new Headers()

	for (const name of RESPONSE_HEADERS) {
		const value = res.headers.get(name)

		if (value) forwarded.set(name, value)
	}

	return new Response(res.body, { status: res.status, headers: forwarded })
}

const mimirRoutes = new Hono<SessionEnv>()

mimirRoutes.all('/places/*', forward)
mimirRoutes.all('/visits/*', forward)

export { mimirRoutes }
