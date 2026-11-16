import { HTTPException } from 'grid'
import { type Context, Hono } from 'hono'
import type { Session } from 'skuld'
import { environment } from '../lib/env.js'
import { logger } from '../lib/log.js'
import { requireSession, type SessionEnv } from '../middleware/session.js'

// Apps' data lives in Mimir, which stays off the internet. Bifrost checks the
// session and forwards the request unchanged, with its user and Mimir's API
// key. Mimir declares which routes need which role, and its own spec
// (services/mimir/openapi.json) describes these paths. The one route that a
// reader with no session can read is the leaderboard of a daily puzzle of the
// numbers app: bifrost forwards it with the user when there is one.

export const unavailable = () => new HTTPException(503, { message: 'App data is unavailable' })

// Only what a JSON API needs. Cookies stay here.
const RESPONSE_HEADERS = ['content-type', 'cache-control']

type MimirUser = Pick<Session['user'], 'id' | 'name' | 'roles' | 'is_verified'>

/**
 * Sends a request to Mimir as `user`, or with no user. Answers 503 when Mimir
 * can't be reached, fails, or refuses the key. Bifrost sends no user only to a
 * route that needs none, so a 401 means the key is wrong.
 */
export async function requestMimir(
	user: MimirUser | null,
	path: string,
	init: { method: string; headers?: Record<string, string>; body?: ArrayBuffer } = {
		method: 'GET',
	},
): Promise<Response> {
	const { MIMIR_URL, MIMIR_API_KEY } = environment()

	if (!MIMIR_URL || !MIMIR_API_KEY) throw unavailable()

	let res: Response

	try {
		res = await fetch(`${MIMIR_URL}${path}`, {
			method: init.method,
			headers: {
				...init.headers,
				authorization: `Bearer ${MIMIR_API_KEY}`,
				...(user && {
					'x-mimir-user': JSON.stringify({
						id: user.id,
						name: user.name,
						roles: user.roles,
						is_verified: user.is_verified,
					}),
				}),
			},
			body: init.body,
			signal: AbortSignal.timeout(10_000),
		})
	} catch (err) {
		logger().error({ err, path }, 'mimir unreachable')

		throw unavailable()
	}

	if (res.status === 401 || res.status >= 500) {
		logger().error({ status: res.status, path }, 'mimir failed')

		throw unavailable()
	}

	return res
}

/** Forwards the request with the user of the session, or a 401 without one. */
function forward(c: Context<SessionEnv>): Promise<Response> {
	return forwardAs(c, requireSession(c).user)
}

/** Forwards the request with the user of the session, or with no user. */
function forwardOpen(c: Context<SessionEnv>): Promise<Response> {
	return forwardAs(c, c.get('session')?.user ?? null)
}

async function forwardAs(c: Context<SessionEnv>, user: MimirUser | null): Promise<Response> {
	const { pathname, search } = new URL(c.req.url)

	const method = c.req.method

	const contentType = c.req.header('content-type')

	const res = await requestMimir(user, `${pathname}${search}`, {
		method,
		headers: contentType ? { 'content-type': contentType } : {},
		body: method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
	})

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
mimirRoutes.all('/trips/*', forward)
mimirRoutes.all('/photos/*', forward)
mimirRoutes.all('/predictions/*', forward)
// A board lists the same players for each reader, so a reader with no session sees it too.
mimirRoutes.get('/games/numbers/daily', forwardOpen)
mimirRoutes.all('/games/*', forward)

export { mimirRoutes }
