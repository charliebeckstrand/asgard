import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { loadEnv } from '../lib/env.js'

export type SessionData = {
	accessToken: string
	refreshToken: string
	expiresAt: number
}

type SessionEnv = {
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

async function refreshAccessToken(
	session: SessionData,
	heimdallUrl: string,
): Promise<SessionData | null> {
	if (refreshLock) return refreshLock

	const attempt = (async () => {
		try {
			const res = await fetch(`${heimdallUrl}/auth/token/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh_token: session.refreshToken }),
			})

			if (!res.ok) return null

			const data = (await res.json()) as {
				access_token: string
				refresh_token: string
				expires_in: number
			}

			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
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
	return encodeSession(data, secret).then((value) => {
		setCookie(c, COOKIE_NAME, value, {
			httpOnly: true,
			secure: true,
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
		const env = loadEnv()

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

		if (sessionData.expiresAt - now < REFRESH_BUFFER_SECONDS && env.HEIMDALL_URL) {
			const refreshed = await refreshAccessToken(sessionData, env.HEIMDALL_URL)

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
