import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'

const COOKIE_NAME = 'bifrost_session'

const PUBLIC_PATHS = ['/login', '/register']

async function verifySession(cookie: string, secret: string): Promise<boolean> {
	try {
		const { payload, sig } = JSON.parse(atob(cookie)) as { payload: string; sig: string }

		const encoder = new TextEncoder()

		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['verify'],
		)

		const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0))

		return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload))
	} catch {
		return false
	}
}

export function auth(sessionSecret?: string): MiddlewareHandler {
	return async (c, next) => {
		if (PUBLIC_PATHS.some((p) => c.req.path.startsWith(p))) {
			return next()
		}

		if (!sessionSecret) {
			return c.redirect('/login')
		}

		const cookie = getCookie(c, COOKIE_NAME)

		if (!cookie) {
			return c.redirect('/login')
		}

		const valid = await verifySession(cookie, sessionSecret)

		if (!valid) {
			return c.redirect('/login')
		}

		return next()
	}
}
