import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { verifyToken } from '../jwt.js'
import type { UserRow } from '../services/users.js'
import { findUserById } from '../services/users.js'

export type AuthEnv = {
	Variables: {
		user: UserRow
	}
}

export function bearer(): MiddlewareHandler<AuthEnv> {
	return async (c, next) => {
		const authorization = c.req.header('Authorization')

		if (!authorization?.startsWith('Bearer ')) {
			throw new HTTPException(401, { message: 'Missing or malformed bearer token' })
		}

		const token = authorization.slice(7)

		let claims: Awaited<ReturnType<typeof verifyToken>>

		try {
			claims = await verifyToken(token)
		} catch {
			throw new HTTPException(401, { message: 'Invalid or expired token' })
		}

		if (claims.type !== 'access') {
			throw new HTTPException(401, { message: 'Invalid token type' })
		}

		const user = await findUserById(claims.sub)

		if (!user) {
			throw new HTTPException(401, { message: 'User not found' })
		}

		if (!user.is_active) {
			throw new HTTPException(403, { message: 'Account is inactive' })
		}

		c.set('user', user)

		await next()
	}
}
