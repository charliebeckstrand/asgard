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

// How long after signing in a session may still change how its user signs in.
const RECENT_SIGN_IN_SECONDS = 10 * 60

/**
 * The current session, when it may change how its user signs in, or a 403.
 * Guards every such change, and asks for three things in turn:
 *
 * - A verified email, so someone who registered an email they don't own can't
 *   add a passkey or a connected account that would outlive the owner's
 *   password reset.
 * - A passed second step. A user with no second factor yet passes, so they can
 *   add their first one.
 * - A sign-in from the last ten minutes, so a stolen session can't add a factor
 *   of its own and keep the account.
 */
export async function authorizeSignInChange(c: Context<SessionEnv>): Promise<Session> {
	const current = requireSession(c)

	if (!current.user.is_verified) {
		throw new AuthError('email_unverified', 'Verify your email to change how you sign in')
	}

	if (!current.two_step && secondFactorMethods(await getFactors(current.user.id)).length > 0) {
		throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
	}

	if (Date.now() - new Date(current.created_at).getTime() > RECENT_SIGN_IN_SECONDS * 1000) {
		throw new AuthError('sign_in_again', 'Sign in again to change how you sign in')
	}

	return current
}

// Roles whose routes also need a session that passed the second step.
const STEP_UP_ROLES: ReadonlySet<Role> = new Set(['admin'])

/**
 * Lets only a user with `role` through. For a role in `STEP_UP_ROLES`, the
 * session must also have passed the second step. Unlike {@link authorizeSignInChange},
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
