import { HTTPException } from 'grid'
import type { Context, MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { environment } from '../lib/env.js'

export type AuthEnv = {
	Variables: {
		userId: string
	}
}

export function requireAuth(): MiddlewareHandler<AuthEnv> {
	return async (c: Context<AuthEnv>, next) => {
		const header = c.req.header('Authorization')

		if (!header?.startsWith('Bearer ')) {
			throw new HTTPException(401, { message: 'Missing bearer token' })
		}

		const token = header.slice('Bearer '.length)

		let payload: Awaited<ReturnType<typeof verify>>

		try {
			payload = await verify(token, environment().SECRET_KEY, 'HS256')
		} catch {
			throw new HTTPException(401, { message: 'Invalid token' })
		}

		if (
			payload.iss !== 'heimdall' ||
			payload.type !== 'access' ||
			typeof payload.sub !== 'string'
		) {
			throw new HTTPException(401, { message: 'Invalid token' })
		}

		c.set('userId', payload.sub)

		return next()
	}
}
