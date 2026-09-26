import { HTTPException } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Session } from 'skuld'
import {
	findSession,
	getFactors,
	SESSION_TTL_SECONDS,
	secondFactorMethods,
	TICKET_TTL_SECONDS,
} from '../auth/index.js'

export type SessionEnv = {
	Variables: {
		session: Session | null
	}
}

// Sent as `__Host-session`: Secure, path `/` and no Domain, so a sibling
// subdomain or a plain-HTTP page can't set or overwrite it.
const COOKIE_NAME = 'session'

export function getSessionToken(c: Context): string | undefined {
	return getCookie(c, COOKIE_NAME, 'host')
}

export function setSessionCookie(c: Context, token: string): void {
	setCookie(c, COOKIE_NAME, token, {
		prefix: 'host',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	})
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, COOKIE_NAME, { prefix: 'host', secure: true, path: '/' })
}

// A sign-in waiting on its second factor holds `__Host-mfa`, with the same
// attributes as the session cookie.
const TICKET_COOKIE_NAME = 'mfa'

export function getLoginTicket(c: Context): string | undefined {
	return getCookie(c, TICKET_COOKIE_NAME, 'host')
}

export function setLoginTicketCookie(c: Context, token: string): void {
	setCookie(c, TICKET_COOKIE_NAME, token, {
		prefix: 'host',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: TICKET_TTL_SECONDS,
	})
}

export function clearLoginTicketCookie(c: Context): void {
	deleteCookie(c, TICKET_COOKIE_NAME, { prefix: 'host', secure: true, path: '/' })
}

/**
 * Resolves the cookie to a live session on every request, so signing out,
 * expiry and deactivation apply at once. Requests without a cookie never reach
 * the database.
 */
export function session(): MiddlewareHandler<SessionEnv> {
	return async (c, next) => {
		const token = getSessionToken(c)

		const current = token ? await findSession(token) : null

		if (token && !current) {
			clearSessionCookie(c)
		}

		c.set('session', current)

		return next()
	}
}

/** The current session, or a 401. */
export function requireSession(c: Context<SessionEnv>): Session {
	const current = c.get('session')

	if (!current) {
		throw new HTTPException(401, { message: 'Not authenticated' })
	}

	return current
}

/**
 * Lets only an admin with a second factor through. An admin has one from
 * `promote` on, and can't remove the last one. `reset-mfa` removes them all, and
 * the admin then gets the admin routes back when they add a new one.
 */
export function requireAdmin(): MiddlewareHandler<SessionEnv> {
	return async (c, next) => {
		const current = c.get('session')

		if (!current) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		if (current.user.role !== 'admin') {
			throw new HTTPException(403, { message: 'Admin role required' })
		}

		if (secondFactorMethods(await getFactors(current.user.id)).length === 0) {
			throw new HTTPException(403, {
				message: 'Add a passkey or an authenticator app to use the admin pages',
			})
		}

		return next()
	}
}
