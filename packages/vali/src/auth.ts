import { sign } from 'hono/jwt'

/**
 * Issuer matching `grid`'s production token issuer. Tokens signed with a
 * different issuer fail verification — keep this aligned with
 * `packages/grid/src/auth/jwt.ts`.
 */
export const TEST_TOKEN_ISSUER = 'heimdall'

interface BaseTokenOptions {
	/** Subject — defaults to a stable test user id */
	sub?: string
	/** Issuer — defaults to {@link TEST_TOKEN_ISSUER} */
	iss?: string
	/** Issued-at (unix seconds) — defaults to now */
	iat?: number
	/** Expiry (unix seconds) — defaults to now + 3600 */
	exp?: number
	/** Override or add arbitrary claims */
	claims?: Record<string, unknown>
}

/**
 * Sign an HS256 access token with the same payload shape grid produces.
 * Use the same `secret` you stub for `SECRET_KEY` (see {@link stubServiceEnv}).
 *
 * @example
 * ```ts
 * import { signTestAccessToken, TEST_SECRET_KEY } from 'vali/auth'
 *
 * const token = await signTestAccessToken(TEST_SECRET_KEY, { sub: 'user-1' })
 *
 * await app.request('/api/users', { headers: { Authorization: `Bearer ${token}` } })
 * ```
 */
export function signTestAccessToken(
	secret: string,
	options: BaseTokenOptions = {},
): Promise<string> {
	return signTestToken(secret, 'access', options)
}

/**
 * Sign an HS256 refresh token with the same payload shape grid produces.
 * Useful for testing that endpoints reject refresh tokens where access is required.
 */
export function signTestRefreshToken(
	secret: string,
	options: BaseTokenOptions = {},
): Promise<string> {
	return signTestToken(secret, 'refresh', options)
}

function signTestToken(
	secret: string,
	type: 'access' | 'refresh',
	options: BaseTokenOptions,
): Promise<string> {
	const now = options.iat ?? Math.floor(Date.now() / 1000)

	return sign(
		{
			sub: options.sub ?? 'user-test',
			iss: options.iss ?? TEST_TOKEN_ISSUER,
			type,
			iat: now,
			exp: options.exp ?? now + 3600,
			...options.claims,
		},
		secret,
		'HS256',
	)
}

/**
 * Extract a single cookie value from a `Set-Cookie` response header.
 * Returns `undefined` if the cookie isn't present.
 *
 * Hono's `app.request()` returns a standard `Response`; this helper unwraps
 * the cookie without parsing the full header semantics (path, expires, etc.).
 */
export function extractCookie(response: Response, name: string): string | undefined {
	const setCookie = response.headers.get('set-cookie')

	if (!setCookie) return undefined

	const match = setCookie.match(new RegExp(`${escapeRegex(name)}=([^;]+)`))

	return match?.[1]
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
