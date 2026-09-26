import { HTTPException } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Session } from 'skuld'
import {
	AuthError,
	findSession,
	getFactors,
	SESSION_TTL_SECONDS,
	secondFactorMethods,
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
 * The current session, when it passed the second step, or a 403
 * `second_step_required`. A user with no second factor yet passes, so they can
 * add their first one. Guards every change to how a user signs in.
 */
export async function requireSecondStep(c: Context<SessionEnv>): Promise<Session> {
	const current = requireSession(c)

	if (current.two_step) return current

	if (secondFactorMethods(await getFactors(current.user.id)).length === 0) return current

	throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
}

/**
 * Lets only an admin through, on a session that passed the second step. Unlike
 * {@link requireSecondStep}, it has no pass for a user without a second factor:
 * after `reset-mfa`, the admin adds a new one, which passes the step.
 */
export function requireAdmin(): MiddlewareHandler<SessionEnv> {
	return async (c, next) => {
		const current = requireSession(c)

		if (current.user.role !== 'admin') {
			throw new HTTPException(403, { message: 'Admin role required' })
		}

		if (!current.two_step) {
			throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
		}

		return next()
	}
}
