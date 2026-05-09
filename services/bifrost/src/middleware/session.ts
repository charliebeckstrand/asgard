import { HttpError } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { refreshTokenPair } from '../auth/index.js'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '../auth/jwt.js'
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

// HMAC signature prevents tampering with the cookie value.
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

// Returns null on any decode/verify failure so callers can fall back to "no session".
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
				expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
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

export function requireSession(): MiddlewareHandler<SessionEnv> {
	return async (c: Context<SessionEnv>, next) => {
		const sessionData = c.get('session')

		if (!sessionData) {
			throw new HttpError(401, 'Not authenticated', 'Unauthorized')
		}

		return next()
	}
}

export { encodeSession as _encodeSession, decodeSession as _decodeSession }
