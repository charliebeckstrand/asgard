import { verifyAccessToken } from 'heimdall'
import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

export type AuthUser = {
	id: string
	email: string
}

type AuthEnv = {
	Variables: {
		user: AuthUser
	}
}

/**
 * Authentication middleware that verifies Bearer tokens.
 *
 * Expects a Bearer token in the Authorization header and verifies it
 * directly via the heimdall package. On success, sets `c.get("user")`.
 */
export function auth(): MiddlewareHandler<AuthEnv> {
	return async (c: Context<AuthEnv>, next) => {
		const authorization = c.req.header('Authorization')

		if (!authorization?.startsWith('Bearer ')) {
			throw new HTTPException(401, { message: 'Missing or invalid authorization header' })
		}

		const token = authorization.slice(7)

		if (!token) {
			throw new HTTPException(401, { message: 'Invalid token' })
		}

		try {
			const user = await verifyAccessToken(token)

			c.set('user', { id: user.id, email: user.email })
		} catch {
			throw new HTTPException(401, { message: 'Invalid or expired token' })
		}

		await next()
	}
}
