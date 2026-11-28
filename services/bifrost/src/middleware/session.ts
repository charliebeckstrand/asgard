import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Role } from 'skuld'
import {
	AuthError,
	createSession,
	findSession,
	type OAuthProvider,
	SESSION_TTL_SECONDS,
	secondFactorMethods,
} from '../auth/index.js'
import { record } from '../lib/activity.js'
import { mfaRepository } from '../lib/repositories.js'
import type { Session } from '../lib/schemas.js'

export type SessionEnv = {
	Variables: {
		session: Session | null
	}
}

// Sent as `__Host-session`: Secure, path `/` and no Domain, so a sibling
// subdomain or a plain-HTTP page can't set or overwrite it.
const COOKIE_NAME = 'session'

function getSessionToken(c: Context): string | undefined {
	return getCookie(c, COOKIE_NAME, 'host')
}

function setSessionCookie(c: Context, token: string): void {
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
 * Starts a session for `userId`, replacing the one the browser still holds, and
 * sets its cookie. Every way to sign in ends here. A passkey sign-in passes the
 * second step.
 */
export async function signIn(
	c: Context,
	userId: string,
	method: 'password' | 'passkey' | OAuthProvider,
) {
	const { token, session } = await createSession(userId, {
		replacing: getSessionToken(c),
		twoStep: method === 'passkey',
	})

	setSessionCookie(c, token)

	await record(c, { userId, actorId: userId, action: 'signed_in', detail: method })

	return session
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
		throw new AuthError('not_authenticated', 'Not authenticated')
	}

	return current
}

/** Answers 401 without a session, before a route validates its body. */
export const sessionRequired: MiddlewareHandler<SessionEnv> = async (c, next) => {
	requireSession(c)

	return next()
}

// How long after signing in a session may still change how its user signs in.
const RECENT_SIGN_IN_SECONDS = 10 * 60

/**
 * The current session, when it may change how its user signs in, or a 403.
 * Guards every such change. It asks first for a verified email, so someone who
 * registered an email they don't own can't add a passkey or a connected
 * account that would outlive the owner's password reset, and then for what
 * {@link confirmRecentSecondStep} asks.
 */
export async function authorizeSignInChange(c: Context<SessionEnv>): Promise<Session> {
	const current = requireSession(c)

	if (!current.user.is_verified) {
		throw new AuthError('email_unverified', 'Verify your email to change how you sign in')
	}

	return confirmRecentSecondStep(current, 'change how you sign in')
}

/**
 * The current session, when it may delete its account, or a 403. An unverified
 * email is no bar: an account made with someone else's email is its maker's
 * to delete.
 */
export function authorizeAccountDeletion(c: Context<SessionEnv>): Promise<Session> {
	return confirmRecentSecondStep(requireSession(c), 'delete your account')
}

/**
 * Returns `current` when it may `action`, or a 403. Asks for two things in turn:
 *
 * - A passed second step. A user with no second factor yet passes, so they can
 *   add their first one.
 * - A sign-in from the last ten minutes, so a stolen session can't add a factor
 *   of its own and keep the account, or delete it.
 */
async function confirmRecentSecondStep(current: Session, action: string): Promise<Session> {
	if (
		!current.two_step &&
		secondFactorMethods(await mfaRepository.getFactors(current.user.id)).length > 0
	) {
		throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
	}

	if (Date.now() - new Date(current.created_at).getTime() > RECENT_SIGN_IN_SECONDS * 1000) {
		throw new AuthError('sign_in_again', `Sign in again to ${action}`)
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
			throw new AuthError('role_required', `The ${role} role is required`)
		}

		if (STEP_UP_ROLES.has(role) && !current.two_step) {
			throw new AuthError('second_step_required', 'Confirm that it is you with a second step')
		}

		return next()
	}
}
