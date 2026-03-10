import { getConfig } from 'heimdall'
import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { jwt } from 'hono/jwt'
import { environment } from '../lib/env.js'

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
 * Authentication middleware using Hono's built-in JWT helper.
 *
 * Extracts and verifies the Bearer token via `jwt()`, then checks
 * the token type and fetches the user from the repository.
 */
export function auth(): MiddlewareHandler<AuthEnv> {
	const env = environment()

	const jwtMiddleware = jwt({ secret: env.SECRET_KEY, alg: 'HS256' })

	return async (c: Context<AuthEnv>, next) => {
		try {
			await jwtMiddleware(c, async () => {})
		} catch {
			throw new HTTPException(401, { message: 'Invalid or expired token' })
		}

		const payload = c.get('jwtPayload')

		if (payload.type !== 'access') {
			throw new HTTPException(401, { message: 'Invalid token type' })
		}

		const { userRepository } = getConfig()

		const user = await userRepository.getUserById(payload.sub)

		if (!user || !user.is_active) {
			throw new HTTPException(401, { message: 'Invalid or expired token' })
		}

		c.set('user', { id: user.id, email: user.email })

		await next()
	}
}
