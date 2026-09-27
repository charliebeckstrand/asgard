import { HTTPException } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Role, Session } from 'skuld'
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
 * The current session, when its email is verified and it passed the second
 * step, or a 403. A user with no second factor yet passes the step, so they can
 * add their first one. Guards every change to how a user signs in.
 *
 * The email check stops someone who registered an email they don't own from
 * adding a passkey or a connected account that would outlive the owner's
 * password reset.
 */
export async function requireSecondStep(c: Context<SessionEnv>): Promise<Session> {
	const current = requireSession(c)

	if (!current.user.is_verified) {
		throw new AuthError('email_unverified', 'Verify your email to change how you sign in')
	}

	if (current.two_step) return current

	if (secondFactorMethods(await getFactors(current.user.id)).length === 0) return current

	throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
}

// Roles whose routes also need a session that passed the second step.
const STEP_UP_ROLES: ReadonlySet<Role> = new Set(['admin'])

/**
 * Lets only a user with `role` through. For a role in `STEP_UP_ROLES`, the
 * session must also have passed the second step. Unlike {@link requireSecondStep},
 * it has no pass for a user without a second factor: after `reset-mfa`, the
 * admin adds a new one, which passes the step.
 */
export function requireRole(role: Role): MiddlewareHandler<SessionEnv> {
	return async (c, next) => {
		const current = requireSession(c)

		if (!current.user.roles.includes(role)) {
			throw new HTTPException(403, { message: `The ${role} role is required` })
		}

		if (STEP_UP_ROLES.has(role) && !current.two_step) {
			throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
		}

		return next()
	}
}
