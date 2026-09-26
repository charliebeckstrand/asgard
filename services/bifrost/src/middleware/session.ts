import { HTTPException } from 'grid'
import { getIpAddress } from 'grid/middleware'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { UserRole } from 'skuld'
import { z } from 'zod'
import { getConfig, refreshTokenPair } from '../auth/index.js'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '../auth/jwt.js'
import { environment } from '../lib/env.js'

const SessionPayloadSchema = z.object({
	sessionId: z.string(),
	accessToken: z.string(),
	refreshToken: z.string(),
	expiresAt: z.number(),
})

export type SessionData = z.infer<typeof SessionPayloadSchema>

/** A cookie session that is still live in the database, with its user. */
export type Session = SessionData & {
	userId: string
	role: UserRole
}

export type SessionEnv = {
	Variables: {
		session: Session | null
	}
}

const COOKIE_NAME = 'bifrost_session'

const REFRESH_BUFFER_SECONDS = 30

async function encodeSession(data: SessionData, secret: string): Promise<string> {
	return sign({ ...data }, secret, 'HS256')
}

// Returns null on any decode/verify failure so callers can fall back to "no session".
async function decodeSession(cookie: string, secret: string): Promise<SessionData | null> {
	try {
		const payload = await verify(cookie, secret, 'HS256')

		const parsed = SessionPayloadSchema.safeParse(payload)

		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

// Concurrent requests carrying the same cookie share one refresh, so the
// token is rotated once. Keyed by refresh token so sessions never mix.
const refreshes = new Map<string, Promise<SessionData | null>>()

function refreshSession(sessionData: SessionData, ip: string): Promise<SessionData | null> {
	const { refreshToken } = sessionData

	const pending = refreshes.get(refreshToken)

	if (pending) return pending

	const attempt = (async () => {
		try {
			const tokens = await refreshTokenPair(refreshToken, ip)

			return {
				sessionId: tokens.session_id,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
			}
		} catch {
			return null
		}
	})()

	refreshes.set(refreshToken, attempt)

	void attempt.finally(() => {
		refreshes.delete(refreshToken)
	})

	return attempt
}

export async function setSessionCookie(
	c: Context,
	data: SessionData,
	secret: string,
): Promise<void> {
	const value = await encodeSession(data, secret)

	setCookie(c, COOKIE_NAME, value, {
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: REFRESH_TOKEN_TTL_SECONDS,
	})
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, COOKIE_NAME, { path: '/' })
}

export function session(): MiddlewareHandler<SessionEnv> {
	return async (c: Context<SessionEnv>, next) => {
		const env = environment()

		const cookie = getCookie(c, COOKIE_NAME)

		if (!cookie) {
			c.set('session', null)

			return next()
		}

		let sessionData = await decodeSession(cookie, env.SESSION_SECRET)

		if (!sessionData) {
			clearSessionCookie(c)

			c.set('session', null)

			return next()
		}

		const now = Math.floor(Date.now() / 1000)

		if (sessionData.expiresAt - now < REFRESH_BUFFER_SECONDS) {
			const refreshed = await refreshSession(sessionData, getIpAddress(c))

			if (refreshed) {
				sessionData = refreshed

				await setSessionCookie(c, sessionData, env.SESSION_SECRET)
			} else {
				clearSessionCookie(c)

				c.set('session', null)

				return next()
			}
		}

		// Checked on every request so logout, revocation and deactivation apply at once.
		const user = await getConfig().sessionRepository.getSessionUser(sessionData.sessionId)

		if (!user) {
			clearSessionCookie(c)

			c.set('session', null)

			return next()
		}

		c.set('session', { ...sessionData, userId: user.id, role: user.role })

		return next()
	}
}

export function requireAdmin(): MiddlewareHandler<SessionEnv> {
	return async (c: Context<SessionEnv>, next) => {
		const sessionData = c.get('session')

		if (!sessionData) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		if (sessionData.role !== 'admin') {
			throw new HTTPException(403, { message: 'Admin role required' })
		}

		return next()
	}
}

export { encodeSession as _encodeSession, decodeSession as _decodeSession }
