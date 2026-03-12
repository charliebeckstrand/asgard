import { refreshTokenPair } from 'heimdall'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { environment } from '../lib/env.js'

export type SessionData = {
	accessToken: string
	refreshToken: string
	expiresAt: number
}

export type SessionEnv = {
	Variables: {
		session: SessionData | null
	}
}

const COOKIE_NAME = 'bifrost_session'

const REFRESH_BUFFER_SECONDS = 30

/**
 * Encodes session data into a base64 cookie value.
 * Uses a signed HMAC to prevent tampering.
 */
async function encodeSession(data: SessionData, secret: string): Promise<string> {
	const payload = JSON.stringify(data)

	const encoder = new TextEncoder()

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))

	const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))

	return btoa(JSON.stringify({ payload, sig }))
}

/**
 * Decodes and verifies a session cookie value.
 * Returns null if the cookie is missing, malformed, or tampered with.
 */
async function decodeSession(cookie: string, secret: string): Promise<SessionData | null> {
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

		const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload))

		if (!valid) return null

		return JSON.parse(payload) as SessionData
	} catch {
		return null
	}
}

let refreshLock: Promise<SessionData | null> | null = null

async function refreshAccessToken(sessionData: SessionData): Promise<SessionData | null> {
	if (refreshLock) return refreshLock

	const attempt = (async () => {
		try {
			const tokens = await refreshTokenPair(sessionData.refreshToken)

			return {
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
			}
		} catch {
			return null
		}
	})()

	refreshLock = attempt

	void attempt.finally(() => {
		refreshLock = null
	})

	return attempt
}

export function setSessionCookie(c: Context, data: SessionData, secret: string): Promise<void> {
	const isProduction = process.env.NODE_ENV === 'production'

	return encodeSession(data, secret).then((value) => {
		setCookie(c, COOKIE_NAME, value, {
			httpOnly: true,
			secure: isProduction,
			sameSite: 'Lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 7,
		})
	})
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, COOKIE_NAME, { path: '/' })
}

/**
 * Session middleware reads the session cookie, refreshes the access token
 * if needed, and sets `c.get("session")` with the current session data.
 */
export function session(): MiddlewareHandler<SessionEnv> {
	return async (c: Context<SessionEnv>, next) => {
		const env = environment()

		if (!env.SESSION_SECRET) {
			c.set('session', null)

			return next()
		}

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

		// Refresh if approaching expiry (30s buffer)
		const now = Math.floor(Date.now() / 1000)

		if (sessionData.expiresAt - now < REFRESH_BUFFER_SECONDS) {
			const refreshed = await refreshAccessToken(sessionData)

			if (refreshed) {
				sessionData = refreshed

				await setSessionCookie(c, sessionData, env.SESSION_SECRET)
			} else {
				clearSessionCookie(c)

				c.set('session', null)

				return next()
			}
		}

		c.set('session', sessionData)

		return next()
	}
}

/**
 * Requires an active session. Use after `session()` middleware.
 * For routes that need a valid Bearer token from the session,
 * this injects the Authorization header.
 */
export function requireSession(): MiddlewareHandler<SessionEnv> {
	return async (c: Context<SessionEnv>, next) => {
		const sessionData = c.get('session')

		if (!sessionData) {
			throw new HTTPException(401, { message: 'Not authenticated' })
		}

		return next()
	}
}

export { encodeSession as _encodeSession, decodeSession as _decodeSession }
